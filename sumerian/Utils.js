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
 * Utility functions for this scene.
 */

class SumerianConciergeUtils {
	constructor(errorOutputId) {
		this._errorOutput = document.getElementById(errorOutputId);
		this._video = null;
		this._stream = null;
	}

	get video() {
		return this._video;
	}

	clearError() {
		this._errorOutput.innerHTML = '';
	}

	/* Video helper functions */

	/** 
	 * Gets access and starts the webcam. Uses QVGA dimensions.
	 * Emits "videoCanPlay" event.
	 * @param {String} [videoId] DOM element ID for the video
	 * @param {Number} [faceDetectionRate] Rate per second the face detection algorithm is run. Prints message if webcam FPS is lower than this.
	 */
	startCamera(videoId, faceDetectionRate) {
		
		this._video = document.getElementById(videoId);
		if (!this._video) {
			this._video = document.createElement('video');
		}

		navigator.mediaDevices.getUserMedia({ video: { width: 160, height: 120 }, audio: false })
		.then((stream) => {
			this._video.srcObject = stream;
			this._stream = stream;
			this._video.play();
			

			// Set the video dimensions here as they are set to 0 until the video is ready to play.
			// See https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement.
			this._video.oncanplay = () => {
				this._video.width = this._video.videoWidth;
				this._video.height = this._video.videoHeight;

				const webcamFps = this.precisionRound(stream.getVideoTracks()[0].getSettings().frameRate, 1);
				if (faceDetectionRate > webcamFps) {
					console.log(`[Sumerian Concierge] Your webcam's frame rate is ${webcamFps} fps. We recommend that the 'face detection rate' value on the Main Script Inspector panel is no higher than the webcam frame rate. Hover over the 'face detection rate' parameter on the IDE to see more details.`);
				}

				sumerian.SystemBus.emit("concierge.videoCanPlay");
			}
		})
		.catch((err) => {
			throw new Error(`Camera Error: ${err.name}. ${err.message}`);
		});
	}

	/**
	 * Stops the webcam.
	 */
	stopCamera() {
		if (this._video) {
			this._video.pause();
			this._video.srcObject = null;
		}
		if (this._stream) {
			this._stream.getTracks()[0].stop();
		}
	}

	/**
	 * Gets the webcam input as ImageData object and draws the input on the canvas with the id 'videoId'.
	 * Note that the image is flipped for webcam.
	 * @param {DOMElement} [videoId] Video DOM element
	 * @param {CanvasRenderingContext2D} [canvasContext] Canvas context for the video
	 * @param {int} [width] Canvas width
	 * @param {int} [height] Canvas height
	 * @returns {ImageData} The ImageData object containing the data for the webcam input
	 */
	getWebcamInputImageData(videoId, canvasContext, width, height) {
		canvasContext.clearRect(0, 0, width, height);

		// Flip the image for webcam
		canvasContext.translate(width, 0);
		canvasContext.scale(-1, 1);

		canvasContext.drawImage(videoId, 0, 0, width, height);

		// Reset the transform
		canvasContext.setTransform(1, 0, 0, 1, 0, 0);

		return canvasContext.getImageData(0, 0, width, height);
	}

	/**
	 * Draws the ImageData object onto a CanvasRenderingContext2D
	 * @param {ImageData} [inputImageData] Image data object to draw 
	 * @param {CanvasRenderingContext2D} [canvasContext] Canvas context to draw the image data onto
	 * @param {int} [width] Canvas width
	 * @param {int} [height] Canvas height
	 */
	drawImageData(inputImageData, canvasContext, width, height) {
		canvasContext.clearRect(0, 0, width, height);
		
		if (inputImageData) {
			canvasContext.putImageData(inputImageData, 0, 0);
		}
	}

	/**
	 * Creates a data-URL from the canvas content and draws the webcam feed on the canvas.
	 * Note that the image is flipped for webcam.
	 * @param {DOMElement} [videoId] Video DOM element
	 * @param {Canvas} [canvas] Canvas to draw the video
	 * @param {CanvasRenderingContext2D} [canvasContext] Canvas context for the video
	 * @param {int} [width] Canvas width
	 * @param {int} [height] Canvas height
	 * @returns {DOMString} jpeg image as a string
	 */
	createWebcamFeedURL(videoId, canvas, canvasContext, width, height) {
		canvasContext.clearRect(0, 0, width, height);

		// Flip the image for webcam
		canvasContext.translate(width, 0);
		canvasContext.scale(-1, 1);

		canvasContext.drawImage(videoId, 0, 0, width, height);
		
		const imgURL = canvas.toDataURL('image/jpeg');
		
		// Reset the transform
		canvasContext.setTransform(1, 0, 0, 1, 0, 0);

		return imgURL;
	}

	/**
	 * Shows image on canvas for debugging.
	 * @param {String} [imgStr] Image as a data-URL
	 * @param {CanvasRenderingContext2D} [canvasCtx] Canvas context to draw the image on
	 */
	showImageStringToCanvas(imgStr, canvasCtx) {
		if (imgStr) {
			const image = new Image();
			image.onload = () => {
				canvasCtx.drawImage(image, 0, 0);
			};
			image.src = imgStr;
		}
	}

	/**
	 * Converts string to array buffer
	 * @param {String} str The string
	 * @returns {ArrayBuffer} Array buffer
	 */
	convertStringToArrayBuffer(str, ctx) {
		// 2 bytes for each char
		const buf = new ArrayBuffer(str.length * 2);
		const bufView = new Uint16Array(buf);

		for (let i = 0, len = str.length; i < len; i++) {
			bufView[i] = str.charCodeAt(i);
		}

		return buf;
	}

	/**
	 * Draws rectangle on the canvas. Useful for debugging face detection.
	 * @param {CanvasRenderingContext2D} [canvasContext] The canvas context to draw the rectangle on
	 * @param {String} [color] The color of the rectangle. See https://developer.mozilla.org/en-US/docs/Web/CSS/color_value for options
	 * @param {int} [x] The x-coordinate of the upper-left corner of the rectangle
	 * @param {int} [y] The y-coordinate of the upper-left corner of the rectangle
	 * @param {int} [width] The width of the rectangle, in pixels
	 * @param {int} [height] The height of the rectangle, in pixels
	 * @param {int} [canvasWidth] The width of the canvas
	 * @param {int} [canvasHeight] The height of the canvas
	 */
	drawRectangle(canvasContext, color, x, y, width, height, canvasWidth, canvasHeight) {
		canvasContext.clearRect(0, 0, canvasWidth, canvasHeight);

		canvasContext.strokeStyle = color;
		canvasContext.strokeRect(x, y, width, height);
	
	}

	/**
	 * Get a random integer value less than max.
	 * @param {int} [max] The integer value one greater than the highest value returned by this function.
	 * @returns {Integer} A random integer
	 */
	getRandomInt(max) {
		return Math.floor(Math.random() * Math.floor(max));
	}

	/**
	 * Rounds a number up to 0 or 1 decimal point.
	 * @param {Number} [number] A number input
	 * @param {Integer} [precision] 1 returns 1 decimal place, -1 removes decimal place
	 * @returns {Number} Rounded number
	 */
	precisionRound(number, precision) {
		const factor = Math.pow(10, precision);
			return Math.round(number * factor) / factor;
	}

	/**
	 * Gets the time of the day based on the local time.
	 * @returns {String} Time of the day based on the local time
	 */
	getTimeofDay() {
		const hour = new Date().getHours();
		let tod;

		if (hour >= 6 && hour <= 12) {
			tod = "morning";
		} else if (hour > 12 && hour < 17){
			tod = "afternoon";
		} else {
			tod = "evening";
		}

		return tod;
	}

	/**
	 * Asynchronously waits to execute a function for a period of time in milliseconds.
	 * @param {Integer} [ms] Time in milliseconds
	 * @returns {Promise} Resolves with setTimeout()
	 */
	sleep(ms) {
		return new Promise((resolve) => { setTimeout(resolve, ms) });
	}

	/**
	 * Find key of the object given the value.
	 * @param {Object} [object] The object
	 * @param {Data} [value] The value for the key
	 * @returns {String} The key of the object
	 */
	findKeyOfObject(object, value) {
		return Object.keys(object).find(key => object[key] === value);
	}

	/**
	 * Prints script dependency error message for scripts attached on Main Script entity.
	 *  @param {String} [thisScriptName] The script itself
	 *  @param {String} [dependentScriptName] The script the file depends on
	 */
	printScriptDependencyError(thisScriptName, dependentScriptName) {
		console.error("[Sumerian Concierge] Please make sure that " + dependentScriptName + ".js is loaded before " + thisScriptName + ".js on the Main Script entity. The scripts on the Script Component are loaded from top to bottom in Sumerian - you can change the order of file loading by dragging the files on the Inspector panel.");
	}

	/* Helper functions for handling HTML element visibility */

	/**
	 * Fades in a DOM element with the defined id property.
	 * The classes are defined in CSSGlobal.html.
	 * @param {String} [id] The id property
	 */
	fadeInElementId(id) {
		if (id && id.classList.contains("fade-out")) {
			id.classList.remove("fade-out");
			id.classList.add("fade-in");
		}
	}

	/**
	 * Fades out a DOM element with the defined id property.
	 * The classes are defined in CSSGlobal.html.
	 * @param {String} [id] The id property
	 */
	fadeOutElementId(id) {
		if (id && id.classList.contains("fade-in")) {
			id.classList.add("fade-out");
			id.classList.remove("fade-in");
		}
	}

	/**
	 * Shows DOM element with the defined id property.
	 * The classes are defined in CSSGlobal.html.
	 * @param {String} [id] The id property
	 */
	showElementId(id) {
		if (id && id.classList.contains("hide")) {
			id.disabled = false;

			id.classList.remove("hide");
			id.classList.add("show");

			this.fadeInElementId(id);
		}
	}

	/**
	 * Hides DOM element with the defined id property.
	 * The classes are defined in CSSGlobal.html.
	 * @param {String} [id] The id property
	 */
	hideElementId(id) {
		if (id && id.classList.contains("show")) {
			id.disabled = true;

			this.fadeOutElementId(id);

			id.classList.remove("show");
			id.classList.add("hide");
		}
	}
	/**
	 * API call
	 */
	callAPI() { // 1
// 	const GEO_URL = 'https://sonchau.pythonanywhere.com/summarizer/api/v1.0/summarize';
// 	fetch(GEO_URL) // 2
// 		.then(response => response.json())
// 		.then(({my_response}) => {
// 			console.log(my_response);
		
// 		});
	var proxyUrl = 'https://cors-anywhere.herokuapp.com/',
    targetUrl = 'https://sonchau.pythonanywhere.com/summarizer/api/v1.0/summarize'
	
 fetch(proxyUrl+targetUrl, {
  method: 'post',
  headers: {
    'Accept': 'application/json, text/plain, */*',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({a: 7, str: 'Some string: &=&'})
}).then(res=>res.json())
  .then(res => console.log(res));


}
	
	
};

function setup(args, ctx) {
	ctx.worldData.Utils = new SumerianConciergeUtils('errorMessage');
};