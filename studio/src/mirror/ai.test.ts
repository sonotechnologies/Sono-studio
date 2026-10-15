import { describe, expect, it } from 'vitest';
import { aiEdits, copyAiPrompt, currentTexts } from './ai';
import type { CopyEdit } from './edit';

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
    expect(prompt).toContain('T0: "Start"');
    expect(prompt).toContain('T2 (selected): "Welcome to"');
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
});
