import React from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';

const container = document.getElementById('root');
if (!container) throw new Error('No root element found');

document.documentElement.style.height = '100%';
document.body.style.height = '100%';
document.body.style.margin = '0';
container.style.height = '100%';

const root = createRoot(container);
root.render(<App />);
