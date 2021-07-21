const path = require('path');
require('webpack');
const CopyPlugin = require('copy-webpack-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const BrowserSyncPlugin = require('browser-sync-webpack-plugin');
const TerserPlugin = require("terser-webpack-plugin");

const IS_PROD = process.env.NODE_ENV === 'production';

const outputPath = path.resolve(__dirname, 'dist');

const phaserRoot = path.join(__dirname, 'node_modules/phaser/build/custom/');

const phaserPath = path.join(phaserRoot, 'phaser-split.js');
const pixiPath = path.join(phaserRoot, 'pixi.js');
const p2Path = path.join(phaserRoot, 'p2.js');

const bs = new BrowserSyncPlugin(
  {
    open: false,
    host: 'localhost',
    port: 4000,
    proxy: 'http://localhost:3000/'
  },
  {
    reload: false
  }
);

PLUGINS = IS_PROD ? [] : [bs];

function exposeRules(modulePath, name) {
  return {
    test: (path) => modulePath === path,
    loader: 'expose-loader',
    options: {
      exposes: {
        globalName: name,
        override: true,
      },
    },
  };
}

module.exports = {
  devtool: IS_PROD ? false : 'cheap-source-map',
  mode: process.env.NODE_ENV,
  entry: {
    pacman: path.resolve(__dirname, 'src/index.ts')
  },
  context: path.resolve(__dirname, 'src'),
  output: {
    path: outputPath,
    filename: `[name]${IS_PROD ? '.[chunkhash]' : ''}.bundle.js`,
    publicPath: ''
  },
  resolve: {
    modules: ['node_modules'],
    extensions: ['.ts', '.js'],
    alias: {
      pixi: pixiPath,
      phaser: phaserPath,
      p2: p2Path
    }
  },
  module: {
    rules: [
      {
        test: /\.ts?$/,
        use: ['ts-loader']
      },
      exposeRules(pixiPath, 'PIXI'),
      exposeRules(p2Path, 'p2'),
      exposeRules(phaserPath, 'Phaser')
    ]
  },
  optimization: {
    minimize: IS_PROD,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          ecma: 2016,
          compress: {
            booleans_as_integers: true,
            drop_console: true,
            passes: 2,
          },
          mangle: true,
          module: false,
          toplevel: false,
          ie8: false,
          keep_classnames: false,
          keep_fnames: false,
          safari10: false,
        },
      })
    ]
  },
  plugins: [
    new CleanWebpackPlugin(),
    new CopyPlugin({
      patterns: [
        {
          from: path.join(__dirname, 'assets/**/*'),
          to: path.join(__dirname, 'dist/assets/'),
        },
        {
          from: path.join(__dirname, 'src/**/*'),
          to: path.join(__dirname, 'dist/'),
          globOptions: {
            ignore: [
              "**/*.json",
              "**/*.ts",
              "**/*.ts",
              "**/*.html"
            ]
          },
        },
      ],
    }),
    new HtmlWebpackPlugin({
      title: 'Pacman PWA',
      inject: 'head',
      template: 'index.html'
    }),
    ...PLUGINS
  ],
  devServer: {
    compress: true,
    port: 3000
  }
};
