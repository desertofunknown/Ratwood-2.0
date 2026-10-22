import React from 'react';
import { createRoot } from 'react-dom/client';

import { preview } from './preview';
import { ReactView } from './ReactView';
preview((target, controller) => {
  const root = createRoot(target);
  root.render(<ReactView controller={controller} />);
  return () => root.unmount();
});
