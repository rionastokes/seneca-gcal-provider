/* Copyright © 2021 Seneca Project Contributors, MIT License. */

export default {
  print: false,
  pattern: 'sys:provider,provider:github',
  allow: { missing: true },

  calls: [
    {
      pattern: 'get:info',
      out: { ok: true, details: { sdk: '@octokit/rest' } },
    }
  ]
}
