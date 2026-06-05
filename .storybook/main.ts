import { fileURLToPath } from 'node:url';
import type { StorybookConfig } from '@storybook/react-vite';
import path, { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const config: StorybookConfig = {
  stories: ['../components/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-docs'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  viteFinal: async (config) => {
    const root = path.resolve(__dirname, '..');
    config.resolve = config.resolve || {};
    // More-specific aliases must come before '@' — Vite uses insertion order.
    config.resolve.alias = {
      ...config.resolve.alias,
      // Redirects any import of ColorThemeContext to the Storybook mock,
      // breaking the useChartColors → ColorThemeContext → AuthContext → firebase chain.
      '@/contexts/ColorThemeContext': path.resolve(__dirname, './mocks/ColorThemeContext.tsx'),
      '@': root,
    };
    // next/link and other Next.js internals reference process.env at module level.
    // Vite doesn't define it in the browser bundle, so we shim it here.
    config.define = {
      ...config.define,
      'process.env': {},
    };
    return config;
  },
};

export default config;
