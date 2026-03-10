import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';

if (process.env.BUILD_TYPE === 'prod') {
    process.env.BUILD_TYPE = 'release';
}

const BUILD_TYPE = process.env.BUILD_TYPE || 'release';

export default {
    input: 'src/opentour/OT_TourProducer/index.ts',
    output: {
        dir: 'dist-opentour/modules',
        format: 'esm',
        sourcemap: true,
        entryFileNames: 'ot-tour-producer.js'
    },
    plugins: [
        typescript({
            tsconfig: './tsconfig.ot-tour-producer.json'
        }),
        BUILD_TYPE !== 'debug' && terser()
    ],
    treeshake: 'smallest',
    cache: false
};
