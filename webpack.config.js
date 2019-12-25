const path = require("path");
const webpack = require("webpack");

const _target = "node_modules/three/examples/js/";

module.exports = {
    entry: "./src/main.js",
    output: {
        filename: "main.js",
        path: path.resolve(__dirname, "dist"),
    },
    resolve: {
        alias: {
            "three/OrbitControls":            path.join(__dirname, _target + "controls/OrbitControls.js"),
            "three/EffectComposer":           path.join(__dirname, _target + "postprocessing/EffectComposer.js"),
            "three/LuminosityHighPassShader": path.join(__dirname, _target + "shaders/LuminosityHighPassShader.js"),
            "three/Bokeh2Shader":             path.join(__dirname, _target + "shaders/BokehShader2.js"),
            "three/CopyShader":               path.join(__dirname, _target + "shaders/CopyShader.js"),
            "three/RenderPass":               path.join(__dirname, _target + "postprocessing/RenderPass.js"),
            "three/ShaderPass":               path.join(__dirname, _target + "postprocessing/ShaderPass.js"),
            "three/UnrealBloomPass":          path.join(__dirname, _target + "postprocessing/UnrealBloomPass.js"),
        }
    },
    plugins: [
        new webpack.ProvidePlugin({
            "THREE": "three"
        }),
    ],
};
