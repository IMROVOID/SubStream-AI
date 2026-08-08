import React from 'react';
import ReactDOM from 'react-dom/client';
import AppWrapper from './App'; // Changed the import to the default export
// ponytail: Suppress non-error console logs in browser console to prevent info leaks; console.error remains active.
console.log = () => {};
console.warn = () => {};
console.info = () => {};
console.debug = () => {};

import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <AppWrapper />
);