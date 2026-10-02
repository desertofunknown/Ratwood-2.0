import type { ComponentProps } from 'react';
import { TextArea as CoreTextArea } from 'tgui-core/base-components';

export function TextArea(props: ComponentProps<typeof CoreTextArea>) {
  // Prose fields must let players Tab to the next control. Editors can opt in to indentation.
  return <CoreTextArea {...props} dontUseTabForIndent={props.dontUseTabForIndent ?? true} />;
}
