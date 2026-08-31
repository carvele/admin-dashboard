module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '\\.(jpg|jpeg|png|gif|webp|svg)$': '<rootDir>/__mocks__/fileMock.js'
  },
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': ['ts-jest', { tsconfig: 'tsconfig.json' }]
  },
  // three/examples/jsm ships raw ESM and needs transforming like our own
  // source -- garmentIngestor.ts imports GLTFLoader from there.
  transformIgnorePatterns: ['/node_modules/(?!three/examples/)']
};
