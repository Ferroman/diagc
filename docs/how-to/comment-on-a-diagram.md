# Comment on a diagram

Leave remarks and resource links on any node or relation, and read them on the published page.

## In the studio

1. Select the element. In the inspector, the **Comments** section lists what is there; type in the box and press **Add**. Set the author and date on a row if they matter.
2. For a node, the **Links** section takes a label and a URL per row.
3. A badge appears at the element's bottom-right corner (a chip a quarter of the way along an arrow) with the comment count, or `↗` when there are only links. Click it to open the bubble; drag the bubble to where it reads best. Its place and open state are saved with the layout, so the published page opens the way you left it.

## In TypeScript

```ts
import { model } from '@diagc/core';

const m = model('payments');
const web = m.node('web', { name: 'Web app', type: 'c4-container' });
const api = m
  .node('api', { name: 'Payments API', type: 'c4-container' })
  .comment('Rate limit is provisional', { by: 'Ann', at: '2026-09-22' })
  .link('Design doc', 'https://…');

m.relate(web, api, { kind: 'sync', comments: [{ id: 'c1', text: 'Retries on 503' }] });
```

`.comment()` and `.link()` are on every `NodeRef`; `.comment()` is also on the `FlowRef` a threat-model `.flow()` hands back. `m.relate()` itself returns the builder, not a ref, so a plain relation's comments go through `RelateOpts.comments` instead — as above — or `m.addComment({ relation: id }, text, opts)`. See [Builder API reference](../reference/builder-api.md#refcommenttext-opts--ref).

## On the published page

The badge is a button: readers click it to read the comments and follow the links (new tab). Nothing on the page writes anywhere — comments are authored data.
