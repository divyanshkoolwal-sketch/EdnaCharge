// Enforce Conventional Commits on the commit-msg hook (see .husky/commit-msg).
// Feeds the Changesets release-notes automation.
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'body-max-line-length': [0, 'always', Infinity],
    'footer-max-line-length': [0, 'always', Infinity],
  },
};
