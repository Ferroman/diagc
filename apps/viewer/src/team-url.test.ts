// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readTeamView, useTeamViewUrl, withTeamView, writeTeamView } from './team-url';

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

describe('team-url', () => {
  it('reads group and hide', () => {
    expect(readTeamView('?group=1&hide=a%2Cb,__unassigned__')).toEqual({
      grouped: true,
      hidden: ['a,b', '__unassigned__'],
    });
  });

  it('reads nothing as the default view', () => {
    expect(readTeamView('')).toEqual({ grouped: false, hidden: [] });
    expect(readTeamView('?plane=x&hide=')).toEqual({ grouped: false, hidden: [] });
  });

  it('writes them back without adding history, keeping other parameters', () => {
    window.history.replaceState(null, '', '/page.html?plane=p#frag');
    const before = window.history.length;
    const push = vi.spyOn(window.history, 'pushState');
    writeTeamView(true, ['t 1', 'p,2']);
    expect(window.history.length).toBe(before);
    expect(push).not.toHaveBeenCalled();
    expect(location.search).toBe('?plane=p&group=1&hide=t%201,p%2C2');
    expect(location.hash).toBe('#frag');
    expect(readTeamView(location.search)).toEqual({ grouped: true, hidden: ['t 1', 'p,2'] });
  });

  it('leaves the address alone when the view is the default', () => {
    window.history.replaceState(null, '', '/page.html?plane=p');
    const replace = vi.spyOn(window.history, 'replaceState');
    writeTeamView(false, []);
    expect(replace).not.toHaveBeenCalled();
    window.history.replaceState(null, '', '/page.html?group=1&hide=a&plane=p');
    writeTeamView(false, []);
    expect(location.search).toBe('?plane=p');
  });

  it('the hook writes on change, and never in an export', () => {
    const { rerender } = renderHook((p: { g: boolean; h: string[]; off: boolean }) => useTeamViewUrl(p.g, p.h, p.off), {
      initialProps: { g: false, h: [] as string[], off: false },
    });
    rerender({ g: true, h: ['a'], off: false });
    expect(location.search).toBe('?group=1&hide=a');
    window.history.replaceState(null, '', '/');
    rerender({ g: true, h: ['b'], off: true });
    expect(location.search).toBe('');
  });

  it('seeds an opening only when a view is given', () => {
    expect(withTeamView({ plane: 'p' }, undefined)).toEqual({ plane: 'p' });
    expect(withTeamView(undefined, undefined)).toBeUndefined();
    expect(withTeamView({ plane: 'p' }, { grouped: true, hidden: ['a'] })).toEqual({
      plane: 'p',
      grouped: true,
      hidden: ['a'],
    });
  });
});
