import express from 'express';
import clinicApp from './dist/app.js';

// Keep the framework import for Vercel's native Express entry detection.
// The normal build typechecks the API; export its compiled instance directly
// so middleware, proxy settings, authorization and streams remain unchanged.
export default clinicApp;
