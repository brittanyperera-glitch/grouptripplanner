import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// The shipped release (src/content/release.json) replaces the vote flow, which every other test exercises.
// Release tests opt back in with vi.unmock('./release') or vi.doMock.
vi.mock('./lib/release', () => ({ RELEASE: null, releaseFor: () => null }))
