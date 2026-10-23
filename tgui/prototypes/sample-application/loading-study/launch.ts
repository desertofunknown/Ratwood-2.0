import { startApplication } from './application-bootstrap.js';

void startApplication().catch((error) => {
  const root = document.getElementById('fixture-root');
  if (root) {
    const failure = document.createElement('p');
    failure.setAttribute('role', 'alert');
    failure.textContent =
      'The disconnected sample could not start. Reload to try again.';
    root.replaceChildren(failure);
  }
  console.error(error);
});
