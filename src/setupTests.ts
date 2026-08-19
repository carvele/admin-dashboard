import '@testing-library/jest-dom';
import { TextEncoder, TextDecoder } from 'node:util';

Object.assign(globalThis, { TextEncoder, TextDecoder });

// Mock environment variables for testing
process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';
process.env.VITE_SUPABASE_ANON_KEY = 'test-anon-key';
