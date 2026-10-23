// A source shim keeps the literal emitted URL intact on the pinned Bun build.
// It does not create or install a second endpoint.
export {
  boundary,
  endpoint,
  validateBoundary,
} from './application-bootstrap.js';
