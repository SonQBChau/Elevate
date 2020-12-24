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
 * This script handles touch/ mouse interactions on the floor plan and gets corresponding pick results from Sumerian Picking System. The name of the picked interactable entity is matched against the primary key in DynamoDB database to show the tooltip, including user name and photo.
 * 
 * The dimension for the tooltip UI is defined in Tooltip.html.
 * 
 * Take a look at the "Aiko" entity under Map > Furniture entity as an example of how interactable entities are structured in the Entities panel.
 * 
 * This script depends on Utils.js. 
 * Please make sure that the above script is loaded before this script Tooltip.js.
 */

function setup(args, ctx) {
	validateUserInputs(args);

	ctx.worldData.tooltipEntity = ctx.entity;

	ctx.worldData.tooltipEntity.hide();
	ctx.worldData.tooltip = document.getElementById("tooltipUI");
	ctx.selectedEntityDiv = document.getElementById("selected");

	ctx.tooltipName = document.getElementById("tooltipName");
	ctx.tooltipImage = document.getElementById('tooltipImage');

	ctx.clickedEntity = null;

	const tooltipUIProperties = window.getComputedStyle(document.getElementById("tooltipUI"), null);

	ctx.imgWidth = parseInt(tooltipUIProperties.getPropertyValue("width"));
	ctx.imgHeight = parseInt(tooltipUIProperties.getPropertyValue("height"));

	/**
	 * Listener function for mousedown on the Sumerian canvas.
	 * Sets the tooltip positions and calls the Sumerian pick event.
	 * @param {Event} [e] Mouse or touch event
	 */
	ctx.setTooltip = (e) => {
		if (ctx.worldData.screenStates && ctx.worldData.screenStates.currentScreenState === ctx.worldData.screenOptions.mapScreen) {
			// Mouse clicks or touch
			const x = e.offsetX || e.targetTouches[0].clientX;
			const y = e.offsetY || e.targetTouches[0].clientY;

			setTooltipPositions(x, y, args, ctx);

			// Note that pick requires a mesh
			ctx.world.sumerianRunner.pick(x, y, (index) => { 
				getClickedEntityName(index, emitPickEvent, args, ctx);
			});
		}
	}

	/**
	 * Fills out the tooltip card
	 * @param {String} [clickedEntityName] Name of entity clicked from Sumerian Picking System
	 */
	ctx.fillOutCard = (clickedEntityName) => {
		if (ctx.tooltipName && ctx.tooltipImage) {
			transitionOutTooltip(ctx);

			if (clickedEntityName) {
				// The name of the entity must match the username in the database
				getUserData(clickedEntityName, ctx).then((userData) => {
					setUserData(userData, ctx);
				}).then(() => {
					if (ctx.worldData.tooltipEntity) {
						transitionInTooltip(ctx);
						playTooltipSoundEffect(ctx);
					}
				});
			}
		}
	}
	
	/**
	 * Hides the tooltip entity.
	 */
	ctx.hideTooltip = () => {
		ctx.worldData.tooltipEntity.hide();
	}

	/**
	 * Listener function for touch interaction to show the tooltip.
	 */
	ctx.setTooltipWithTouch = (e) => {
		ctx.setTooltip(e);
		e.preventDefault();
	}

	/**
	 * Listener function for touch interaction to hide the tooltip.
	 */
	ctx.hideTooltipWithTouch = (e) => {
		ctx.hideTooltip();
		e.preventDefault();
	}

	// ctx.domElement is the canvas
	ctx.domElement.addEventListener("mousedown", ctx.setTooltip);
	ctx.domElement.addEventListener("mouseup", ctx.hideTooltip);

	ctx.domElement.addEventListener("touchstart", ctx.setTooltipWithTouch);
	ctx.domElement.addEventListener("touchend", ctx.hideTooltipWithTouch);

	sumerian.SystemBus.addListener("concierge.pickEvent", ctx.fillOutCard);
};

function cleanup(args, ctx) {
	ctx.domElement.removeEventListener("mousedown", ctx.setTooltip);
	ctx.domElement.removeEventListener("mouseup", ctx.hideTooltip);

	ctx.domElement.removeEventListener("touchstart", ctx.setTooltipWithTouch);
	ctx.domElement.removeEventListener("touchend", ctx.hideTooltipWithTouch);

	sumerian.SystemBus.removeListener("concierge.pickEvent", ctx.fillOutCard);
};

/**
 * Sets the tooltip positions based on user specifications.
 * The positions are calculated on each mouse/ touch event as we use fixed positions for the tooltip DOM elements.
 * @param {Event} [x] The x-coordinate of the mouse/touch events
 * @param {Event} [y] The y-coordinate of the mouse/touch events
 */
function setTooltipPositions(x, y, args, ctx) {
	ctx.worldData.tooltip.style.left = x + args.xOffset + "px";
	ctx.worldData.tooltip.style.top = y + args.yOffset + "px";

	if (x >= (window.innerWidth - ctx.imgWidth)) {
		ctx.worldData.tooltip.style.left = (x - args.xOffset - ctx.imgWidth) + "px";
	}

	// Move tooltip to show on the top right of the clicked area if the tooltip would be hidden on the bottom of the screen
	if (y >= (window.innerHeight - ctx.imgHeight)) {
		ctx.worldData.tooltip.style.top = (y - args.yOffset - ctx.imgHeight) + "px";
	}
}

/**
 * Gets the desired name of the entity from the picking event.
 * @param {Number} [index] The index of the clicked entity.
 * @param {Event} [emitPickEvent] The callback for the pick event. Passes the the name of the clicked entity
 */
function getClickedEntityName(index, emitPickEvent, args, ctx) {
	let clickedEntityName;

	if(index !== -1) {
		ctx.clickedEntity = ctx.world.entityManager.getEntityByIndex(index);

		// Go up one level from the mesh entity to see if it matches the interactable object name.
		if (ctx.clickedEntity.parent().first() && ctx.clickedEntity.parent().first().name === args.desk.name) {
			// Go up another level to grab the user name.
			clickedEntityName = ctx.clickedEntity.parent().parent().first().name;
		} else if (ctx.clickedEntity.parent().parent().first() && ctx.clickedEntity.parent().parent().first().name === args.chair.name) {
			clickedEntityName = ctx.clickedEntity.parent().parent().parent().first().name;
		}

		if (clickedEntityName) {
			if (ctx.worldData.isShowingDebugPanel && ctx.selectedEntityDiv) {
				ctx.selectedEntityDiv.innerHTML = clickedEntityName;
			}

			if (typeof emitPickEvent === 'function') {
				emitPickEvent(clickedEntityName);
			}
		}
	}
}

/**
 * Gets the user data from the DynamoDB user table.
 * @param {String} [id] The id used in the DynamoDB user table
 * @returns {Promise} Resolves with user data from DynamoDB
 */
function getUserData(id, ctx) {
	return new Promise((resolve, reject) => {
		const params = {
			Key: {
				"id": {
					S: id
				}
			},
			TableName: ctx.worldData.usersTable
		};

		ctx.worldData.dynamodb.getItem(params, (err, data) => {
			if (err) {
				throw new Error(`Error getting user data from Amazon DynamoDB: ${err.name}. ${err.message}`);
			} else {
				const userData = AWS.DynamoDB.Converter.unmarshall(data['Item']);
				resolve(userData);
			}
		});
	})
}

/**
 * Sets the user data on the tooltip name.
 * @param {Object} [userData] User data returned from DynamoDB
 * @returns {Promise} Promise
 */
function setUserData (userData, ctx) {
	return new Promise((resolve, reject) => {
		ctx.tooltipName.innerHTML = userData.username;
		ctx.tooltipImage.src = userData.img_url;

		if (!userData.username) {
			ctx.tooltipName.innerHTML = '';
		}

		if (!userData.img_url) {
			ctx.tooltipImage.src = '';
		}

		resolve();
	})
}

/**
 * Transitions out DOM elements when user clicks / touches an interactable entity.
 */
function transitionOutTooltip(ctx) {
	ctx.worldData.tooltip.classList.remove("fade-in-fast");
	ctx.worldData.tooltip.classList.add("fade-out-fast");

	ctx.tooltipName.classList.remove("fade-in-fast-delayed");
	ctx.tooltipName.classList.add("fade-out-fast-delayed");

	if (ctx.worldData.Utils) {
		ctx.worldData.Utils.hideElementId(ctx.tooltipName);
	} else {
		console.error("[Sumerian Concierge] Please make sure that Utils.js is loaded before MainScript.js.")
	}

	if (ctx.tooltip && ctx.tooltip.isVisible) {
		ctx.worldData.tooltipEntity.hide();
	}
}

/**
 * Transitions in DOM elements when user clicks / touches an interactable entity.
 */
function transitionInTooltip(ctx) {
	ctx.worldData.tooltip.classList.remove("fade-out-fast");
	ctx.worldData.tooltip.classList.add("fade-in-fast");

	ctx.tooltipName.classList.remove("fade-out-fast-delayed");
	ctx.tooltipName.classList.add("fade-in-fast-delayed");

	ctx.worldData.Utils.showElementId(ctx.tooltipName);

	ctx.worldData.tooltipEntity.show();
}

/*
 * Plays sound effect on showing tooltip.
 */
function playTooltipSoundEffect(ctx) {
	if (ctx.entity.getComponent("SoundComponent").sounds[0]) {
		ctx.entity.getComponent("SoundComponent").sounds[0].play();
	}
}

/**
 * Emits the event called concierge.pickEvent with the picked entity name.
 * @param {String} [pickedEntityName] The name of the picked entity
 */
function emitPickEvent(pickedEntityName) {
	sumerian.SystemBus.emit("concierge.pickEvent", pickedEntityName);
}

/**
 * Validates user input.
 */
function validateUserInputs(args) {
	if (!args.desk) {
		sumerian.SystemBus.emit("sumerian.warning", { title: "Please specify the desk entity on 'Tooltip.js'", message: "Please specify the desk entity on 'Tooltip.js' on 'Tooltip' entity. By default, this entity is called 'small_door_desk' from Virtual Concierge > Map > Furniture > Aiko on the Entities panel. You can drag and drop the entity onto the inspector panel of the script file."});
	}

	if (!args.chair) {
		sumerian.SystemBus.emit("sumerian.warning", { title: "Please specify the chair entity on 'Tooltip.js'", message: "Please specify the chair entity on 'Tooltip.js' on 'Tooltip' entity. By default, this entity is called 'office_Chair' from Virtual Concierge > Map > Furniture > Aiko in the Entities panel. You can drag and drop the entity onto the inspector panel of the script file."});
	}
}

var parameters = [
	{
		name: "Tooltip X Offset",
		key: 'xOffset',
		type: 'int',
		default: 16,
		description: "The amount to offset the user image to the right (in pixels) from the clicked/ touched point. Use negative values to offset to the left."
	},
	{
		name: "Tooltip Y Offset",
		key: 'yOffset',
		type: 'int',
		default: 16,
		description: "The amount to offset the user image downwards (in pixels) from the clicked/ touched point. Use negative values to offset upwards."
	},
	{
		name: 'Clickable Entity (Desk)',
		key: 'desk',
		type: 'entity',
		description: "Drop the Desk entity here. The default is called 'small_door_desk'."
	},
	{
		name: 'Clickable Entity (Chair)',
		key: 'chair',
		type: 'entity',
		description: "Drop the chair entity here. The default is called 'office_Chair'."
	}
]