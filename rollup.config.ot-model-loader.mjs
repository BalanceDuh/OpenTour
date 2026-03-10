import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';

if (process.env.BUILD_TYPE === 'prod') {
    process.env.BUILD_TYPE = 'release';
}

const BUILD_TYPE = process.env.BUILD_TYPE || 'release';

export default {
    input: 'src/opentour/OT_ModelLoader/index.ts',
    output: {
        dir: 'dist-opentour/modules',
        format: 'esm',
        sourcemap: true,
        entryFileNames: 'ot-model-loader.js'
    },
    plugins: [
        typescript({
            tsconfig: './tsconfig.ot-model-loader.json'
        }),
        BUILD_TYPE !== 'debug' && terser()
    ],
    treeshake: 'smallest',
    cache: false
};
