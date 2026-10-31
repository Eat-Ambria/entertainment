/**
 * URL of a file in public/, honouring the deploy base path (e.g. "/repo-name/" on GitHub Pages,
 * "/" locally). Use it instead of a hard-coded "/file.webp".
 */
export const asset = (file: string): string => `${import.meta.env.BASE_URL}${file}`;
