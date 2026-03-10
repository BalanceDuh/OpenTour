import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';

if (process.env.BUILD_TYPE === 'prod') {
    process.env.BUILD_TYPE = 'release';
}

const BUILD_TYPE = process.env.BUILD_TYPE || 'release';

export default {
    input: 'src/opentour/OT_TourDownload/index.ts',
    output: {
        dir: 'dist-opentour/modules',
        format: 'esm',
        sourcemap: true,
        entryFileNames: 'ot-tour-download.js'
    },
    plugins: [
        typescript({
            tsconfig: './tsconfig.ot-tour-download.json'
        }),
        BUILD_TYPE !== 'debug' && terser()
    ],
    treeshake: 'smallest',
    cache: false
};
