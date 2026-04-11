import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        // Browser globals
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        AudioContext: 'readonly',
        requestAnimationFrame: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        HTMLElement: 'readonly',
        Option: 'readonly',
        Event: 'readonly',
        MouseEvent: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-undef': 'error',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    // Test files get Vitest globals and Node/Web test-environment globals
    files: ['src/*.test.js'],
    languageOptions: {
      globals: {
        // Vitest
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        vi: 'readonly',
        global: 'readonly',
        // Node (available in Vitest ESM test files via Vitest's own injection)
        __dirname: 'readonly',
        __filename: 'readonly',
        // Web globals used in service-worker tests
        Response: 'readonly',
        Request: 'readonly',
        // Touch polyfill globals assigned in keyboard-events tests
        Touch: 'readonly',
        TouchEvent: 'readonly',
      },
    },
  },
];
