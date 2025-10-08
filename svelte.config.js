import { vitePreprocess } from '@astrojs/svelte';

export default {
	preprocess: vitePreprocess(),
	compilerOptions: {
		// Filter out all a11y warnings
		warningFilter: (warning) => {
			// Ignore all accessibility warnings
			if (warning.code?.startsWith('a11y_')) return false;
			return true;
		},
		runes: true,
		experimental: {
			async: true,
		},
	},
}
