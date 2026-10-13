import type { SectionOf } from '../schema';
import { CustomFrame } from '../custom/frame';
import type { RenderCtx } from '../primitives';

type Props = { section: SectionOf<'custom'>; ctx: RenderCtx };

/** An AI-written section, previewed in the sandboxed frame. (On export it becomes a normal component.) */
export function Custom({ section, ctx }: Props) {
  const def = ctx.customSections?.[section.content.component];
  if (!def) return null;
  return (
    <CustomFrame
      id={section.id}
      js={def.js}
      data={section.content.data}
      style={ctx.themeCss ?? ''}
      fonts={ctx.fonts ?? []}
      base={ctx.link('/').replace(/\/$/, '')}
      editable={ctx.editable}
    />
  );
}
