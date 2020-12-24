'use strict';

/*
 Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 
 Licensed under the Apache License, Version 2.0 (the "License").
 You may not use this file except in compliance with the License.
 A copy of the License is located at
 
    http://www.apache.org/licenses/LICENSE-2.0
 
 or in the "license" file accompanying this file. This file is distributed 
 on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either 
 express or implied. See the License for the specific language governing 
 permissions and limitations under the License.
 */

/**
 * This script is used to configure the scene for different screen resolutions and aspect ratios, such as POI bounds, font sizes, and host positions.
 * 
 * Use the 'Test POI' option in the 'Setup Configuration' in conjunction with the POI input fields on this script to set the Host's range of eye movement (POI) horizontally and vertically. Set these values before you enter the Play mode. 
 * 
 * Turn on the 'isShowingConfigPanel' boolean to toggle the visibility of the top debug panel. This contains more details on setting up the POI as well as other hardware setup instructions. Make sure to set the flag before you enter Play mode.
 */

// POI default values
const x0_value = -0.8;
const x1_value = 0.5;
const y0_value = 1.5;
const y1_value = 1.7;

function setup(args, ctx) {
	validateParameters(args);
	
	// Add more custom configurations for screen setup as needed.
	const config = {
		['Laptop (1920x1080)']: {
			resolution: '1920x1080',
			description: 'Suitable for laptops',
			hostPosition: new sumerian.Vector3(0, 0, 0),
			POIPosition: new sumerian.Vector4(-0.6, 0.1, 1.5, 1.7),
			mainTextWidth: '35%',
			titleFontSize: '2em',
			subtitleFontSize: '1.5em',
			bodyFontSize: '1em',
		},
		['Reduced resolution (1080x800)']: {
			resolution: '1080x800',
			description: "Suitable for reduced resolution settings such as for projectors. When it's not necessary to use higher resolution, you can improve the frame rate by reducing the screen resolution in your OS' Display Settings.",
			hostPosition: new sumerian.Vector3(0.1, 0, -0.3),
			POIPosition: new sumerian.Vector4(-0.8, 0.5, 1.5, 1.7),
			mainTextWidth: '40%',
			titleFontSize: '1.75em',
			subtitleFontSize: '0.75em',
			bodyFontSize: '0.5em',
		},
		['Test POI']: {
			resolution: '1920x1080',
			description: 'Based on Laptop (1920x1080) configuration. Use this setting to configure the POI bounds. You can update the above configurations with these POI values as needed, or create a new configuration option.',
			hostPosition: new sumerian.Vector3(0, 0, 0),
			POIPosition: new sumerian.Vector4(args.x0,  args.x1,  args.y0,  args.y1),
			mainTextWidth: '35%',
			titleFontSize: '1.75em',
			subtitleFontSize: '0.75em',
			bodyFontSize: '0.75em',
		}
	};
	
	const configType = setConfigType(config, args.setupConfig);
	
	/* Camera setup */

	ctx.worldData.camera = args.camera;
	const camInitialPosition =  new sumerian.Vector3(-0.18, 1.65, 1.5);
	const camInitialRotation =  new sumerian.Vector3(0, 0, 0);
	
	setEntityTransform(ctx.worldData.camera, camInitialPosition, camInitialRotation);
	
	/* Host setup */

	ctx.worldData.host = args.host;
	ctx.worldData.host.transformComponent.setTranslation(configType.hostPosition);
	
	/* Font and CSS setup */

	if (document.querySelector('#mainTextContent')){
		document.querySelector('#mainTextContent').style.width = configType.mainTextWidth;
	}

	ctx.worldData.textWidth = configType.mainTextWidth;

	if (document.querySelector('.title_large')) {
		document.querySelector('.title_large').style.fontSize = configType.h1FontSize;	
	}
	if (document.querySelector('.title_small')) {
		document.querySelector('.title_small').style.fontSize = configType.h2FontSize;
	}
	if (document.querySelector('body')) {
		document.querySelector('body').style.fontSize = configType.bodyFontSize;
	}

	/* Point of Interest (POI) setup for the Host */

	ctx.worldData.poiTarget = args.poiTarget;
	ctx.worldData.poiTarget.setTranslation(-0.3, 1.65, 1.5);

	ctx.worldData.POIBounds = {
		x0: configType.POIPosition.getComponent(0),
		x1: configType.POIPosition.getComponent(1),
		y0: configType.POIPosition.getComponent(2),
		y1: configType.POIPosition.getComponent(3)
	}

	/* Debug panel setup */

	const configPanel = document.querySelector("#configPanel");
	if (configPanel) {
		if (args.isShowingConfigPanel) {
			configPanel.classList.remove("hide");
			configPanel.classList.add("show");
		} else {
			configPanel.classList.remove("show");
			configPanel.classList.add("hide");
		}
	}
};

/**
 * Sets the entity's position and rotation
 * @param {Entity} [entity] Entity to set the Transform Component of
 * @param {Vector3} [position] Position
 * @param {Vector3} [rotation] Rotation in radians
 */
function setEntityTransform(entity, position, rotation) {
	entity.transformComponent.setTranslation(position);
	entity.transformComponent.setRotation(rotation);
}

/**
 * Validates and sets configuration type
 * @param {Object} [configObject] The configuration object describing different setup options
 * @param {String} [configType] The selected configuration name
 * @returns {Object} The selected configuration object
 */
function setConfigType(configObject, configType) {
	if (Object.keys(configObject).includes(configType)) {
		return configObject[configType];
	} else {
		sumerian.SystemBus.emit("sumerian.warning", { title: "The configuration type does not exist", message: `The selected configuration type does not exist. Please make sure that ${configType} exists in the config object in the 'Initialization.js' script file.`});
	}
}

/**
 * Validates that all required parameter inputs are specified on the Inspector.
 * Note: Validation for args.setupConfig is done in setConfigType() so it can be checked against config keys.
 */
function validateParameters(args) {
	if (!args.camera) {
		sumerian.SystemBus.emit("sumerian.warning", { title: "Please specify the camera entity on Initialization.js", message: "Please specify the camera entity on the inspector panel of 'Initialization.js' on the 'Main Script' entity to configure your scene. By default, this entity is called 'Closeup Camera', and you can drag and drop the entity onto the inspector panel of the script file."});
	}

	if (!args.host) {
		sumerian.SystemBus.emit("sumerian.warning", { title: "Please specify the Host entity on Initialization.js", message: "Please specify the Host entity on the inspector panel of 'Initialization.js' on the 'Main Script' entity to configure the scene for your target screen size. By default, this entity is called 'Host', and you can drag and drop the entity onto the inspector panel of the script file."});
	}

	if (!args.poiTarget) {
		sumerian.SystemBus.emit("sumerian.warning", { title: "Please specify the Host POI entity on Initialization.js", message: "Please specify the Host's point of interest (POI) target entity on the inspector panel of 'Initialization.js' on the 'Main Script' entity to configure the scene for your target screen size. By default, this entity is called 'Host POI Target', and you can drag and drop the entity onto the inspector panel of the script file."});
	}
}

var parameters = [
	{
		name: "Setup configuration",
		key: 'setupConfig',
		type: 'string',
		control: 'select',
		options: ['Laptop (1920x1080)', 'Reduced resolution (1080x800)', 'Test POI'],
		default: 'Laptop (1920x1080)',
		description: 'Hardware setup configuration. Tweak the config parameter in this script file to suit your setup.'
	}, {
		name: 'Show config panel',
		key: 'isShowingConfigPanel',
		type: 'boolean',
		default: true,
		description: 'Hide instruction on the screen.'
	},
	{
		name: 'Camera',
		key: 'camera',
		type: 'entity',
		description: "Drop the camera entity that's used for the screen setup here. This entity is called 'Closeup Camera' in this asset pack."
	},
	{
		name: 'Host',
		key: 'host',
		type: 'entity',
		description: "Drop the Host entity that's used for the screen setup here. This entity is called 'Host' in this asset pack."
	},
	{
		name: 'Host POI target',
		key: 'poiTarget',
		type: 'entity',
		description: "Drop the Host Point of Interest entity here. This entity is called 'Host POI target' in this asset pack."
	},
	{
		name: 'POI x_min (left)',
		key: 'x0',
		type: 'float',
		default: x0_value,
		description: "The leftmost point on the x axis the host can look. The value is only used for 'Test POI' setup configuration."
	}, {
		name: 'POI x_max (right)',
		key: 'x1',
		type: 'float',
		default: x1_value,
		description: "The rightmost point on the x axis the host can look. The value is only used for 'Test POI' setup configuration."
	}, {
		name: 'POI y_min (bottom)',
		key: 'y0',
		type: 'float',
		default: y0_value,
		description: "The topmost point on the y axis the host can look. The value is only used for 'Test POI' setup configuration."
	}, {
		name: 'POI y_max (top)',
		key: 'y1',
		type: 'float',
		default: y1_value,
		description: "The bottommost point on the y axis the host can look. The value is only used for 'Test POI' setup configuration."
	}
];