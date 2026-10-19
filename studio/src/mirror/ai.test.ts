import { describe, expect, it } from 'vitest';
import { aiEdits, copyAiPrompt, currentTexts, mergeAi, undoAi } from './ai';
import { applyEdits, findSpots, safeHref, type CopyEdit } from './edit';

const page = `<html><head><title>Kora</title></head><body>
<nav><a href="index.html">Home</a> <a href="about.html">About us</a></nav>
<h1>Welcome to <b>Kora</b> Kitchen</h1>
<p>Call 0803 111 2222</p>
<img src="img/hero.jpg" alt="Hero">
</body></html>`;

describe('AI changes to a copy', () => {
  it('shows the page as numbered texts, links and pictures, with earlier changes in', () => {
    const edits: CopyEdit[] = [{ kind: 'text', page: 'index.html', index: 0, from: 'Home', to: 'Start' }];
    const { prompt, system } = copyAiPrompt({ page: 'index.html', title: 'Kora', html: page, edits, message: 'Shorter heading', selected: [2], history: [] });
    expect(prompt).toContain('T0 [a in nav]: "Start"');
    expect(prompt).toContain('T2 [h1] (selected): "Welcome to"');
    expect(prompt).toContain('T3 [b]: "Kora"');
    expect(prompt).toContain('L1: about.html ("About us")');
    expect(prompt).toContain('I0: alt="Hero" file=hero.jpg');
    expect(prompt).toContain('Request: Shorter heading');
    expect(system).toContain('Never invent facts');
    expect(currentTexts('index.html', page, edits)[0]).toEqual({ index: 0, original: 'Home', now: 'Start' });
  });

  it('turns the reply into editor edits, replacing earlier ones and dropping bad ones', () => {
    const edits: CopyEdit[] = [{ kind: 'text', page: 'index.html', index: 5, from: 'Call 0803 111 2222', to: 'Call 0803 000' }];
    const r = aiEdits('index.html', page, edits, {
      reply: 'Done',
      changes: [
        { kind: 'text', id: 5, to: 'Call 0809 999 8888', everywhere: true },
        { kind: 'text', id: 3, to: '<b>Lagos</b> <late>' },
        { kind: 'link', id: 1, href: 'https://wa.me/2348099998888' },
        { kind: 'link', id: 0, href: 'javascript:alert(1)' },
        { kind: 'text', id: 99, to: 'nowhere' },
        { kind: 'alt', id: 0, alt: 'Our dining room' },
      ],
    });
    expect(r.dropped).toBe(2);
    expect(r.edits).toEqual([
      { kind: 'text', page: '*', index: 5, from: 'Call 0803 111 2222', to: 'Call 0809 999 8888' },
      { kind: 'text', page: 'index.html', index: 3, from: 'Kora', to: 'Lagos <late>' },
      { kind: 'link', page: 'index.html', index: 1, from: 'about.html', href: 'https://wa.me/2348099998888' },
      { kind: 'image', page: 'index.html', index: 0, from: 'img/hero.jpg', alt: 'Our dining room' },
    ]);
  });

  it('keeps "every page" changes when one page changes its own text, and ignores numbers it never showed', () => {
    const star: CopyEdit = { kind: 'text', page: '*', index: 5, from: 'Call 0803 111 2222', to: 'Call 0809' };
    const r = aiEdits('index.html', page, [star], { reply: '', changes: [{ kind: 'text', id: 5, to: 'Ring 0809' }, { kind: 'text', id: 2, to: 'Hello' }] }, { texts: [5], links: [], images: [] });
    expect(r.edits).toEqual([star, { kind: 'text', page: 'index.html', index: 5, from: 'Call 0803 111 2222', to: 'Ring 0809' }]);
    expect(r.dropped).toBe(1);
    // Back to the original on this page only: a page change is still needed so the "every page" one doesn't show through.
    const back = aiEdits('index.html', page, [star], { reply: '', changes: [{ kind: 'text', id: 5, to: 'Call 0803 111 2222' }] });
    expect(back.edits).toHaveLength(2);
    // Something that's already so changes nothing and isn't counted as a failure.
    const same = aiEdits('index.html', page, [star], { reply: '', changes: [{ kind: 'text', id: 5, to: 'Call 0809', everywhere: true }] });
    expect([same.changed, same.dropped, same.put.length]).toEqual([0, 0, 0]);
  });

  it('puts AI changes over newer hand edits and undoes only its own', () => {
    const hand: CopyEdit = { kind: 'text', page: 'index.html', index: 0, from: 'Home', to: 'Start' };
    const old: CopyEdit = { kind: 'text', page: 'index.html', index: 2, from: 'Welcome to', to: 'Hi' };
    const r = aiEdits('index.html', page, [old], { reply: '', changes: [{ kind: 'text', id: 2, to: 'Hello at' }] });
    const typedMeanwhile = [old, hand];
    const merged = mergeAi(typedMeanwhile, r.put, r.removed);
    expect(merged).toEqual([hand, { kind: 'text', page: 'index.html', index: 2, from: 'Welcome to', to: 'Hello at' }]);
    const later: CopyEdit = { kind: 'text', page: 'index.html', index: 1, from: 'About us', to: 'Story' };
    expect(undoAi([...merged, later], r.put, r.removed)).toEqual([hand, later, old]);
  });

  it('keeps an emptied text in place, so later texts keep their numbers', () => {
    const { html } = applyEdits('index.html', page, [{ kind: 'text', page: 'index.html', index: 2, from: 'Welcome to', to: '' }]);
    expect(findSpots(html).texts.map((t) => t.value.trim())[2]).toBe('\u200b');
    expect(findSpots(html).texts).toHaveLength(findSpots(page).texts.length);
  });

  it('refuses scripts hidden with control characters', () => {
    expect(safeHref('java\tscript:alert(1)')).toBeNull();
    expect(safeHref('\x01javascript:alert(1)')).toBeNull();
    expect(safeHref('https://wa.me/234')).toBe('https://wa.me/234');
  });
});
