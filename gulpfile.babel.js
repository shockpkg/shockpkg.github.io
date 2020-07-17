/* eslint-disable jsdoc/require-jsdoc */

import path from 'path';
import util from 'util';
import stream from 'stream';

import fse from 'fs-extra';
import glob from 'glob';
import supportsColors from 'supports-color';
import pug from 'pug';
import browserslist from 'browserslist';
import webpack from 'webpack';
import MiniCssExtractPlugin from 'mini-css-extract-plugin';
import UglifyJsPlugin from 'uglifyjs-webpack-plugin';
import OptimizeCSSAssetsPlugin from 'optimize-css-assets-webpack-plugin';
import postcssPresetEnv from 'postcss-preset-env';
import gulp from 'gulp';
import gulpPug from 'gulp-pug';
import gulpRename from 'gulp-rename';
import execa from 'execa';
import del from 'del';

const pipeline = util.promisify(stream.pipeline);
const globP = util.promisify(glob);

const dist = 'dist';
const distAbs = path.resolve('./dist');

async function exec(cmd, args = []) {
	await execa(cmd, args, {
		preferLocal: true,
		stdio: 'inherit'
	});
}

async function babelrc() {
	babelrc.json = babelrc.json || fse.readFile('.babelrc', 'utf8');
	return Object.assign(JSON.parse(await babelrc.json), {
		babelrc: false
	});
}

function babelrcGetEnv(opts) {
	for (const preset of opts.presets) {
		if (preset[0] === '@babel/preset-env') {
			return preset[1];
		}
	}
	return null;
}

async function browserslistrc() {
	browserslistrc.data = browserslistrc.data ||
		fse.readFile('.browserslistrc', 'utf8');
	return browserslist.parseConfig(await browserslistrc.data).defaults;
}

async function webpackTarget(min) {
	const browserslist = await browserslistrc();

	const babelOpts = await babelrc();
	babelOpts.cacheDirectory = true;

	const babelOptsEnv = babelrcGetEnv(babelOpts);
	babelOptsEnv.modules = false;
	babelOptsEnv.targets = {
		browsers: browserslist
	};

	const entryPaths = await globP('./res/*.{ts,tsx,js,jsx,mjs,mjsx}');
	const entries = {};
	for (const entry of entryPaths) {
		const p = path.basename(entry).replace(/\.[^.]*$/, '');
		entries[p] = entry;
	}

	const options = {
		entry: entries,
		output: {
			filename: '[name].js',
			path: path.join(distAbs, 'res')
		},
		mode: min ? 'production' : 'development',
		devtool: 'source-map',
		resolve: {
			extensions: [
				'.js',
				'.jsx',
				'.mjs',
				'.mjsx',
				'.ts',
				'.tsx',
				'.json',
				'.css',
				'.less',
				'.scss',
				'.sass'
			]
		},
		module: {
			rules: [
				{
					test: /\.(js|jsx|mjs|mjsx|ts|tsx)$/,
					exclude: /(node_modules)/,
					use: {
						loader: 'babel-loader',
						options: babelOpts
					}
				},
				{
					test: /\.(sass|scss|css)$/,
					use: [
						MiniCssExtractPlugin.loader,
						{
							loader: 'css-loader',
							options: {
								sourceMap: true
							}
						},
						{
							loader: 'postcss-loader',
							options: {
								sourceMap: true,
								modules: true,
								plugins: loader => [
									postcssPresetEnv({
										stage: 0,
										browsers: browserslist
									})
								]
							}
						},
						{
							loader: 'sass-loader',
							options: {
								sourceMap: true
							}
						}
					]
				}
			]
		},
		plugins: [
			new MiniCssExtractPlugin({
				filename: '[name].css',
				chunkFilename: '[id].css'
			})
		],
		optimization: {
			minimizer: [
				min ? new UglifyJsPlugin({
					cache: true,
					parallel: true,
					sourceMap: true,
					uglifyOptions: {
						output: {
							comments: false
						}
					}
				}) : null,
				min ? new OptimizeCSSAssetsPlugin({
					cssProcessorOptions: {
						map: {
							inline: false
						},
						discardComments: {
							removeAll: true
						}
					}
				}) : null
			].filter(Boolean)
		}
	};

	await new Promise((resolve, reject) => {
		const compiler = webpack(options);
		compiler.run((err, stats) => {
			if (stats) {
				if (!err && stats.hasErrors()) {
					// eslint-disable-next-line prefer-destructuring
					err = stats.compilation.errors[0];
				}

				// eslint-disable-next-line no-console
				console.log(stats.toString({
					colors: supportsColors
				}));
			}

			if (err) {
				reject(err);
				return;
			}
			resolve();
		});
	});
}

async function eslint(strict) {
	try {
		await exec('eslint', ['.']);
	}
	catch (err) {
		if (strict) {
			throw err;
		}
	}
}

// clean

gulp.task('clean:logs', async () => {
	await del([
		'npm-debug.log*',
		'yarn-debug.log*',
		'yarn-error.log*'
	]);
});

gulp.task('clean:dist', async () => {
	await del([
		'dist'
	]);
});

gulp.task('clean', gulp.parallel([
	'clean:logs',
	'clean:dist'
]));

// lint (watch)

gulp.task('lintw:es', async () => {
	await eslint(false);
});

gulp.task('lintw', gulp.parallel([
	'lintw:es'
]));

// lint

gulp.task('lint:es', async () => {
	await eslint(true);
});

gulp.task('lint', gulp.parallel([
	'lint:es'
]));

// build

gulp.task('build:tpl', async () => {
	await pipeline([
		gulp.src([
			'tpl/**/*.pug'
		]),
		gulpPug({
			pug
		}),
		gulpRename(path => {
			path.extname = '.html';
		}),
		gulp.dest(dist)
	]);
});

gulp.task('build:res', async () => {
	await webpackTarget(process.NODE_ENV !== 'development');
});

gulp.task('build', gulp.parallel([
	'build:tpl',
	'build:res'
]));

// all

gulp.task('all', gulp.series([
	'clean',
	'lint',
	'build'
]));

// watched

gulp.task('watched', gulp.series([
	'clean',
	'lintw',
	'build'
]));
