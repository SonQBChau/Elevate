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
 * This script is the controller for the Speech Component and associated UI changes.
 */

function setup(args, ctx) {
	ctx.entityData.Speech = new SpeechController("hostSpeech", ctx.worldData.host, "Amy");

	ctx.worldData.recordingButton = document.getElementById("recordMic");

	/**
	 * Enables the UI interactions for voice recording and other buttons.
	 */
	ctx.enableInteraction = () => {
		ctx.worldData.Utils.showElementId(ctx.worldData.recordingButton);

		// Show "Close info" button at the end of the speech if the scene is in infoScreen state.
		// Otherwise, show the info button.
		if (ctx.worldData.screenStates.currentScreenState === ctx.worldData.screenOptions.infoScreen) {
			ctx.worldData.Utils.showElementId(ctx.worldData.closeInfoButton);
		} else {
			ctx.worldData.Utils.showElementId(ctx.worldData.infoButton);
		}

		// Show the "Show map" button at the end of the Host's speech
		if (ctx.worldData.screenStates.currentScreenState === ctx.worldData.screenOptions.mapScreen) {
			ctx.worldData.Utils.showElementId(ctx.worldData.mapHint);
			ctx.worldData.Utils.showElementId(ctx.worldData.mapButton);
		}
	}

	/**
	 * Disables the UI interaction for voice recording and other buttons.
	 */
	ctx.disableInteraction = () => {
		ctx.worldData.Utils.hideElementId(ctx.worldData.recordingButton);
		ctx.worldData.Utils.hideElementId(ctx.worldData.infoButton);
		ctx.worldData.Utils.hideElementId(ctx.worldData.mapButton);
	}

	sumerian.SystemBus.addListener('concierge.disableInteractionEvent', ctx.disableInteraction);
	sumerian.SystemBus.addListener('concierge.enableInteractionEvent', ctx.enableInteraction);
};

function cleanup(args, ctx) {
	sumerian.SystemBus.removeListener('concierge.disableInteractionEvent', ctx.disableInteraction);
	sumerian.SystemBus.removeListener('concierge.enableInteractionEvent', ctx.enableInteraction);
};

/**
 * SpeechController is a wrapper around Sumerian's Speech component.
 * @param {String} speechCaptionId The HTML DOM id property used to show the closed caption for the Host's speech
 * @param {Entity} host The entity that uses the Speech Component
 * @param {String} voice The Amazon Polly voice ID used for the speech. Use "Amy" for Cristine, "Brian" for Preston, and "Russell" for Luke.
 * 
 */
class SpeechController {
	constructor(speechCaptionId, host, voice) {
		if (!host.getComponent("SpeechComponent")) {
				sumerian.SystemBus.emit("sumerian.warning", { title: "Speech Component missing on the Host", message: `Please add the Speech Component on the ${host.name} entity.`});
		}

		this._speech = new sumerian.Speech();
		this._speechCaption = document.getElementById(speechCaptionId);
		this._host = host;
		this._hostSpeechComponent = host.getComponent("SpeechComponent");
		this._voice = voice;
		this._isSpeaking = false;
	}

	get isSpeaking() {
		return this._isSpeaking;
	}

	/**
	 * Dynamically creates and plays a string of text, with or without SSML markup.
	 * Sends events to toggle UI interactions.
	 * Note that the <speech> tag is added here.
	 * @param {String} [body] Body of text
	 */
	playSpeech(body) {
		this._isSpeaking = true;
		sumerian.SystemBus.emit("concierge.disableInteractionEvent");

		this._speechCaption.innerHTML = this._fillOutCaption(body); 
		this._hostSpeechComponent.addSpeech(this._speech);

		this._speech.updateConfig({
			entity: this._host,
			body: '<speak>' + body + '</speak>',
			type: 'ssml',
			voice: this._voice
		});

		this._speech.play().then(() => { 
			this._isSpeaking = false; 
			sumerian.SystemBus.emit("concierge.enableInteractionEvent");
		});
	};

	/**
	 * Generates text caption to display on screen using regular expressions.
	 * Removes <> tags, including the SSML tags from Amazon Polly and those set for html markup.
	 * @param {String} [body] Body of text
	 * @returns {String} plain text with bold font style for text that had quotation marks around them.
	 * 
	 */
	_fillOutCaption(body) {
		// Remove all tags
		let plainText = body.replace(/<\/?[^>]+(>|$)/g, "");

		// Find match for ""
		const regex = /(\".*\")/g;
		const match = regex.exec(plainText);

		if (match) {
			// Add the span and bold class
			plainText = plainText.replace(match[0], '<span class="bold">' + match[0] + '</span>');
		}

		return plainText;
	}

	/**
	 * Calls Speech.stop() to stop all speeches
	 */
	stopSpeech() {
		this._speech.stop();
	}
}