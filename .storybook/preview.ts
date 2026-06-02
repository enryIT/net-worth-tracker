import type { Preview } from '@storybook/react-vite';
import { createElement } from 'react';
import { ColorThemeProvider } from './mocks/ColorThemeContext';
import '../app/globals.css';

const VIEWPORTS = {
  mobile: {
    name: 'Mobile (390px)',
    styles: { width: '390px', height: '844px' },
  },
  tablet: {
    name: 'Tablet (768px)',
    styles: { width: '768px', height: '1024px' },
  },
  desktop: {
    name: 'Desktop (1280px)',
    styles: { width: '1280px', height: '800px' },
  },
};

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/,
      },
    },
    viewport: {
      options: VIEWPORTS,
      defaultViewport: 'mobile',
    },
  },
  decorators: [
    (Story) => createElement(ColorThemeProvider, null, createElement(Story)),
  ],
};

export default preview;
