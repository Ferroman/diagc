#!/usr/bin/env python3
"""Generate cold-agent briefs + scoring assertions for the diagc guide-coverage eval.

One case per diagram type or feature. Each case is a brief an agent gets with only
`diagc guide all` to read, and a scorer that runs against the COMPILED artifact —
never against the agent's own report. Checks are declarative strings with only `m`
(the model) and the helpers below in scope.

    python3 scripts/guide-eval/mkcases.py        # writes $DIAGC_EVAL_ROOT/cases/<case>/

`DIAGC_EVAL_ROOT` defaults to <tmp>/diagc-guide-eval. See README.md.
"""
import json, os, shutil, re, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.environ.get("DIAGC_EVAL_ROOT", os.path.join(tempfile.gettempdir(), "diagc-guide-eval"))
CASES_DIR = os.path.join(ROOT, "cases")
GUIDE = os.path.join(ROOT, "guide.md")

# ---- helpers available inside every check expression -------------------------


def name_of(m, i):
    return next((n["name"] for n in m["nodes"] if n["id"] == i), i)


def has(t, *words):
    t = str(t).lower()
    return any(w in t for w in words)


def depth_ok(m, want=3):
    """Longest containment chain, counted from the TOP of the chain: env > cluster
    > workload is depth 3. (First version only considered nodes that were
    themselves children, so a correct 3-level diagram scored 2 and failed —
    the probe was wrong, not the diagram.)"""
    kids = {}
    for c in m["containment"]:
        kids.setdefault(c["parent"], []).append(c["child"])

    def depth(i, seen=()):
        if i in seen:
            return 0
        return 1 + max([depth(k, seen + (i,)) for k in kids.get(i, [])] or [0])

    return any(depth(n["id"]) >= want for n in m["nodes"])


def nthreats(m):
    return sum(len(n.get("threats") or []) for n in m["nodes"]) + sum(
        len(r.get("threats") or []) for r in m["relations"])


def all_threats(m):
    return [t for n in m["nodes"] for t in (n.get("threats") or [])] + \
           [t for r in m["relations"] for t in (r.get("threats") or [])]


def ndates(m):
    return len(re.findall(r"\d{4}-\d{2}-\d{2}", json.dumps(m)))


def prefixed(m):
    return [n for n in m["nodes"] if "/" in n["id"]]


# ---- cases ------------------------------------------------------------------

CASES = {
    "c4": dict(name="mobility", brief="""A C4 diagram of a ride-hailing platform.

- A `Customer` and a `Driver` (people).
- A `Mobility Platform` software system containing three containers: a mobile
  app (iOS/Android), a dispatch API (Go/gRPC) and a Postgres database.
- The customer uses the mobile app; the app calls the dispatch API; the dispatch
  API stores trips in the database; the driver uses the same mobile app.
Use the C4 notation so the boxes get their solid fills, and give the containers
their technology subtitles.""",
        checks=[
            ("notation == c4", "m.get('notation') == 'c4'"),
            (">=2 containment edges", "len(m['containment']) >= 2"),
            (">=3 relations", "len(m['relations']) >= 3"),
            ("c4 node types used", "any(str(n.get('type','')).startswith('c4-') for n in m['nodes'])"),
            ("Customer present", "any('customer' in n['name'].lower() for n in m['nodes'])"),
            ("technology subtitle on a container", "any(n.get('technology') for n in m['nodes'])"),
        ]),

    "deployment": dict(name="payments-infra", brief="""A deployment diagram of a payments service.

- Two environments: `Production` and `Staging`.
- Each environment holds one Kubernetes cluster containing three workloads:
  `payments-api`, `ledger-worker` and `webhook-receiver`.
- A managed Postgres instance sits OUTSIDE the clusters, used by production only.
- Show a connection from `payments-api` to the Postgres instance.
Use nested containment (environment > cluster > workload) and the deployment
notation.""",
        checks=[
            ("notation == deployment", "m.get('notation') == 'deployment'"),
            (">=5 containment edges", "len(m['containment']) >= 5"),
            ("nesting >= 3 deep", "depth_ok(m, 3)"),
            ("Postgres in a relation", "any(has(name_of(m, r['from']), 'postgre') or has(name_of(m, r['to']), 'postgre') for r in m['relations'])"),
            ("both environments", "sum(1 for n in m['nodes'] if has(n['name'], 'production', 'staging')) >= 2"),
        ]),

    "activity": dict(name="order-flow", brief="""An activity diagram of checkout.

- Three swimlanes: `Customer`, `Order Service`, `Payment Gateway`.
- Customer places an order -> Order Service validates the cart (if invalid, the
  flow ends in a rejection) -> Order Service requests authorisation -> Payment
  Gateway decides `Payment approved?`: no -> cancel the order; yes -> Order
  Service charges, then in parallel (fork/join) sends a receipt email AND creates
  a shipping task, then the flow ends.
Use lanes, a decision node and a fork/join bar.""",
        checks=[
            (">=3 lanes (containment)", "len(m['containment']) >= 3"),
            (">=5 relations", "len(m['relations']) >= 5"),
            ("a decision-shaped node", "any(has(n.get('type',''), 'decision', 'choice', 'diamond') for n in m['nodes'])"),
            ("a fork/join bar", "any(has(n.get('type',''), 'fork', 'join', 'bar', 'parallel') for n in m['nodes'])"),
            ("Payment Gateway lane present", "any('payment' in n['name'].lower() for n in m['nodes'])"),
        ]),

    "threat-model": dict(name="pwd-reset", brief="""A STRIDE threat model of a password-reset flow.

- Elements: `User` (external entity), `Web App`, `Reset Service`, `User DB`
  (data store) and an email provider.
- Flows: user requests a reset -> reset service writes a token to the DB ->
  reset service sends email via the email provider -> user submits a new password
  with the token -> web app verifies it against the DB.
- Record AT LEAST four threats against the elements and flows, each with a STRIDE
  category, a title and a severity, and at least one mitigation note. Cover more
  than one STRIDE category.""",
        checks=[
            (">=4 threats recorded", "nthreats(m) >= 4"),
            ("every threat has a category", "all(t.get('category') for t in all_threats(m))"),
            (">=2 distinct STRIDE categories", "len({t.get('category') for t in all_threats(m)}) >= 2"),
            (">=1 severity set", "any(t.get('severity') for t in all_threats(m))"),
            (">=4 relations", "len(m['relations']) >= 4"),
        ]),

    "causal-loop": dict(name="tech-debt", brief="""A causal-loop diagram of how technical debt compounds.

Variables: `Delivery pressure`, `Quick fixes`, `Code complexity`, `Change lead
time`, `Incidents`, `Trust in releases`, `Refactoring time`.

Draw the reinforcing loop (pressure -> quick fixes -> complexity -> lead time ->
pressure) and a balancing loop through `Refactoring time` reducing complexity.
Every link must carry its polarity (+ or -), and mark the delay where complexity
starts to bite.""",
        checks=[
            (">=6 relations", "len(m['relations']) >= 6"),
            ("every relation signed", "all(r.get('polarity') in ('+','-') for r in m['relations'])"),
            (">=1 delay marked", "any(r.get('delay') is True for r in m['relations'])"),
            ("variables left typeless", "sum(1 for n in m['nodes'] if not n.get('type')) >= 4"),
        ]),

    "plan": dict(name="q1-launch", brief="""A launch plan (Gantt-style) for a Q1 product launch.

Three workstreams: `Product`, `Infrastructure`, `Marketing`.

Six dated items across them, each with a start and an end date in 2026-01 or
2026-02, e.g. 'Beta feature complete' 2026-01-05..2026-01-23, 'Scale load test'
2026-01-26..2026-02-06, 'Launch announcement' 2026-02-16..2026-02-20. Assign the
items to their workstreams.""",
        checks=[
            (">=3 workstreams (containment)", "len(m['containment']) >= 3"),
            (">=9 nodes total", "len(m['nodes']) >= 9"),
            ("dates present (>=6)", "ndates(m) >= 6"),
            ("plan notation in play", "m.get('notation') == 'plan' or 'plan' in json.dumps(m).lower()"),
        ]),

    "planes-layers": dict(name="platform-views", brief="""One model of a platform, seen TWO ways, plus an overlay.

Eight nodes: `web`, `orders-api`, `billing-api`, `auth-api`, `orders-db`,
`billing-db`, `queue`, `cache`.

- Plane `systems` groups them by system: Orders (orders-api, orders-db), Billing
  (billing-api, billing-db), Platform (auth-api, queue, cache), plus the `web`
  front end.
- Plane `envs` groups the SAME nodes by where they run: `Public edge` (web,
  cache), `Private` (the APIs and queue) and `Data store` (the databases).
- A layer named `PCI scope` marks exactly three relations as in scope; the base
  picture must still show every relation.
- Relations: web -> orders-api -> orders-db, web -> billing-api -> billing-db,
  orders-api -> queue -> billing-api, billing-api -> cache, auth-api -> cache.""",
        checks=[
            (">=2 planes declared", "len(m['planes']) >= 2"),
            ("containment on a named plane", "any(c.get('plane') for c in m['containment'])"),
            (">=1 layer declared", "len(m['layers']) >= 1"),
            (">=3 relations on a layer", "sum(1 for r in m['relations'] if r.get('layer')) >= 3"),
            (">=8 relations", "len(m['relations']) >= 8"),
        ]),

    "compose": dict(name="umbrella", brief="""Two diagrams already exist in `.diagrams/src/`: `billing.diagram.json` and
`notify.diagram.json`.

Build an umbrella diagram that PULLS BOTH of them in as containers of their own
— composed, not redrawn by hand — so that editing the originals changes the
umbrella. Then draw one cross-diagram relation: the `Notifier` service inside
`billing` calls the `Email gateway` inside `notify`.""",
        checks=[
            (">=15 nodes after grafting", "len(m['nodes']) >= 15"),
            ("grafted ids namespaced", "len(prefixed(m)) >= 10"),
            ("two include prefixes", "len({n['id'].split('/')[0] for n in prefixed(m)}) >= 2"),
            ("a cross-diagram relation", "any('/' in r['from'] and '/' in r['to'] and r['from'].split('/')[0] != r['to'].split('/')[0] for r in m['relations'])"),
        ]),
}

RULES = """## Rules

- Work ONLY in {dir}. Do not touch any other directory.
- `diagc` is on your PATH.
- `{guide}` is the ONLY documentation you may read. Do not search the web, do not
  browse a repository, do not look for examples. If the guide does not say how to
  do something, that is a real finding — do the nearest thing you can and say so.
- Write the diagram to `.diagrams/src/{name}.diagram.ts` (a `.diagram.json` is
  accepted by the compiler too if you prefer that).
- Iterate until `diagc lint --json` prints `[]` and exits 0.
- Then run `diagc show {name}` and check it against the brief.
- Finish your reply with exactly one last line: `ITERATIONS: <n>` — how many
  times you ran `diagc lint`.

## Brief

"""


def compose_fixtures(d):
    billing = {"version": 1, "id": "billing", "name": "Billing",
               "nodes": [{"id": "invoices", "name": "Invoice Service", "type": "service"},
                         {"id": "notifier", "name": "Notifier", "type": "service"},
                         {"id": "ledger", "name": "Ledger DB", "type": "database"}],
               "containment": [],
               "relations": [{"id": "b1", "from": "invoices", "to": "ledger", "kind": "writes", "label": "invoices"},
                             {"id": "b2", "from": "invoices", "to": "notifier", "kind": "async", "label": "invoice events"}],
               "layers": [], "planes": []}
    notify = {"version": 1, "id": "notify", "name": "Notify",
              "nodes": [{"id": "router", "name": "Message Router", "type": "service"},
                        {"id": "emailgw", "name": "Email gateway", "type": "service"},
                        {"id": "sms", "name": "SMS gateway", "type": "service"}],
              "containment": [],
              "relations": [{"id": "n1", "from": "router", "to": "emailgw", "kind": "async"},
                            {"id": "n2", "from": "router", "to": "sms", "kind": "async"}],
              "layers": [], "planes": []}
    for f, model in (("billing", billing), ("notify", notify)):
        open(os.path.join(d, f".diagrams/src/{f}.diagram.json"), "w").write(json.dumps(model, indent=1))


def gen(case, d):
    """Write a self-contained scorer for one case."""
    L = ["import json, sys", f"sys.path.insert(0, {HERE!r})",
         "from mkcases import name_of, has, depth_ok, nthreats, all_threats, ndates, prefixed",
         "m = json.load(open(sys.argv[1]))", "res = []"]
    for label, expr in CASES[case]["checks"]:
        L.append(f"res.append(({label!r}, bool({expr})))")
    L += ["for label, ok in res:", "    print(('PASS' if ok else 'FAIL') + '  ' + label)",
          "print('SCORE', sum(1 for _, ok in res if ok), '/', len(res))"]
    open(os.path.join(d, "checks.py"), "w").write("\n".join(L) + "\n")


if __name__ == "__main__":
    if os.path.exists(CASES_DIR):
        shutil.rmtree(CASES_DIR)
    for case, spec in CASES.items():
        d = os.path.join(CASES_DIR, case)
        os.makedirs(os.path.join(d, ".diagrams/src"))
        open(os.path.join(d, ".gitignore"), "w").write(
            ".diagrams/.artifacts/\n.diagrams/html/\n.diagrams/diff/\n")
        open(os.path.join(d, "TASK.md"), "w").write(
            RULES.format(dir=d, name=spec["name"], guide=GUIDE) + spec["brief"] + "\n")
        if case == "compose":
            compose_fixtures(d)
        gen(case, d)
        print(f"{case:15s} -> {d}  ({len(spec['checks'])} checks)")
