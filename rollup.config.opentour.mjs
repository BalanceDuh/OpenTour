import path from 'path';

import alias from '@rollup/plugin-alias';
import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';
import autoprefixer from 'autoprefixer';
import postcss from 'postcss';
import scss from 'rollup-plugin-scss';
import sass from 'sass';

import copyAndWatch from './copy-and-watch.mjs';

if (process.env.BUILD_TYPE === 'prod') {
    process.env.BUILD_TYPE = 'release';
}

const BUILD_TYPE = process.env.BUILD_TYPE || 'release';
const ENGINE_DIR = path.resolve(`node_modules/playcanvas/build/playcanvas${BUILD_TYPE === 'debug' ? '.dbg' : ''}/src/index.js`);
const PCUI_DIR = path.resolve('node_modules/@playcanvas/pcui');
const HREF = process.env.BASE_HREF || '';

const outputHeader = () => {
    const BLUE_OUT = '\x1b[34m';
    const BOLD_OUT = '\x1b[1m';
    const REGULAR_OUT = '\x1b[22m';
    const RESET_OUT = '\x1b[0m';

    const title = [
        'Building OpenTour',
        `type ${BOLD_OUT}${BUILD_TYPE}${REGULAR_OUT}`
    ].map(l => `${BLUE_OUT}${l}`).join('\n');
    console.log(`${BLUE_OUT}${title}${RESET_OUT}\n`);
};

outputHeader();

export default {
    input: 'src/opentour/index.ts',
    output: {
        dir: 'dist-opentour',
        format: 'esm',
        sourcemap: true,
        entryFileNames: 'opentour.js'
    },
    plugins: [
        copyAndWatch({
            targets: [
                {
                    src: 'src/opentour/index.html',
                    transform: (contents) => contents.toString().replace('__BASE_HREF__', HREF)
                },
                { src: 'static/lib', dest: 'static' }
            ]
        }),
        alias({
            entries: {
                'playcanvas': ENGINE_DIR,
                '@playcanvas/pcui': PCUI_DIR
            }
        }),
        typescript({
            tsconfig: './tsconfig.opentour.json'
        }),
        resolve(),
        scss({
            sourceMap: true,
            runtime: sass,
            processor: (css) => {
                return postcss([autoprefixer])
                .process(css, { from: undefined })
                .then(result => result.css);
            },
            fileName: 'opentour.css',
            includePaths: [`${PCUI_DIR}/dist`],
            watch: 'src/opentour'
        }),
        BUILD_TYPE !== 'debug' && terser()
    ],
    treeshake: 'smallest',
    cache: false
};
