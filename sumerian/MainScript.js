'use strict';


/* Host speeches */
// Speech spoken when the start button is clicked or the user greets Cristine
const greeting = "<mark name='gesture:wave'/><break time='500ms'/>Welcome to the Elevated App."

const conversation = [
	'<break time="500ms"/>'+"My name is Cristine. I'm very excited to walk you through the experience",
];

// Speech spoken when the info button is clicked
const infoSpeech = 'You can use the microphone by holding down the mic button or space bar. You can also click on the buttons if you prefer. You can always say, "Show info" to come back to this page.';


const idleSpeech = 'You can hold down the mic button and say, "Check my expression" to see what type of music is good for you.';
// const idleSpeech = '';

// Clarification speech options i.e. when the intent is not understood by Amazon Lex
const clarificationSpeeches = ["Could you please repeat that?", "Can you please say that again?", "Pardon me?"];

// Negative emotions as identified by Amazon Rekognition.
// The host responds with either negativeEmotionGreeting or positiveEmotionGreeting set below.
// See the list of available emotions: https://docs.aws.amazon.com/rekognition/latest/dg/API_Emotion.html
const negativeEmotions = ['SAD', 'ANGRY', 'CONFUSED', 'DISGUSTED', 'CALM'];

// Initial greeting in response to the user's negativeEmotions as understood by Amazon Rekognition
const negativeEmotionGreeting = "<mark name='gesture:heart'/><break time='500ms'/>You look sad. Is everything okay? Do you want to play some soul-soothing music?";

// Initial greeting in response to the user's positiveEmotions as understood by Amazon Rekognition
const positiveEmotionGreeting = "<mark name='gesture:aggressive'/><break time='500ms'/>You look great! How about some happy music?"


let song_id = ""

/* Webcam capture */

/**
 * Sends a snapshot from the webcam to the web worker at the interval of ctx.faceDetectionInterval in ctx.onVideoStarted().
 * It sends the image as a ImageData format to jsfeat and url string if Amazon Rekognition is used.
 */
function sendVideoFrameToWorker(ctx) {
	let videoFrameData = null;

	if (ctx.faceDetectionAlgorithm === ctx.faceDetectionAlgorithmOptions.jsfeat) {
		ctx.videoFrameImageData = ctx.worldData.Utils.getWebcamInputImageData(ctx.videoInput, ctx.canvasInputContext, ctx.canvasOutputWidth, ctx.canvasOutputHeight);
		videoFrameData = {
			'cmd': 'sendVideoFrameDataToJsfeat',
			'msg': ctx.videoFrameImageData
		}
	} else if (ctx.faceDetectionAlgorithm === ctx.faceDetectionAlgorithmOptions.rekognition) {
		ctx.videoFrameInputString = ctx.worldData.Utils.createWebcamFeedURL(ctx.videoInput, ctx.canvasInput, ctx.canvasInputContext, ctx.canvasOutputWidth, ctx.canvasOutputHeight);

		videoFrameData = {
			'cmd': 'sendVideoFrameStringToRekognition',
			'msg': ctx.videoFrameInputString
		}
	}

	ctx.worker.postMessage(videoFrameData);
}

/**
 * Stops the webcam and cleans up the canvas used to draw the video when the webcam is stopped.
 */
function stopVideo(ctx) {
	ctx.worldData.Utils.stopCamera();

	ctx.canvasInputContext.clearRect(0, 0, ctx.canvasInput.width, ctx.canvasInput.height);
	ctx.canvasOutputContext.clearRect(0, 0, ctx.canvasOutputWidth, ctx.canvasOutputHeight);

	window.clearInterval(ctx.sendVideoFrameToWorkerAtInterval);
}

/* POI and Host interactions */

/**
 * Gets the target position of the point of interest (POI) for the Host on the screen.
 * Based on the POI bounds (x0, x1, y0, y1) set in Initialization.js
 * This is called at the interval of worker response when "closestFace" is found.
 * @param {float} [x] The x position (horizontal plane) the Host looks at on the screen
 * @param {float} [y] The y position (vertical plane) the Host looks at on the screen
 * @param {Object} [poiBounds] POI bounds (x0, x1, y0, y1)
 * @returns {Vector3} The position of the target POI target position if a face is found. Otherwise don't return anything because the target position should remain the same.
 */
function getHostPOITargetPosition(x, y, poiBounds, ctx) {
	// Anytime face detection algorithm cannot find a face in the webcam space, x and y values will be undefined.
	// Only update the POI when there is a face.
	if (x && y) {
		const xPercent = x * ctx.invCanvasOutputWidth;
		// The origin is at the top left corner for the webcam feed
		const yPercent = 1 - y * ctx.invCanvasOutputHeight;

		const targetX = poiBounds.x0 + xPercent * (poiBounds.x1 - poiBounds.x0);
		const targetY = poiBounds.y0 + yPercent * (poiBounds.y1 - poiBounds.y0);
		const targetZ = ctx.worldData.poiTarget.getTranslation().getComponent(2);

		return new sumerian.Vector3(targetX, targetY, targetZ);
	}
}

/**
 * Moves the POI target with smoothing.
 * @param {Vector3} target The target position of the POI target entity
 */
function smoothDampHostPOI(target, ctx) {
	if (target) {
		const newX = sumerian.MathUtils.smoothDamp(ctx.currentPoiX, target.x, ctx.poiTargetXStore, ctx.faceDetectionInterval/1000);
		ctx.currentPoiX = newX;

		const newY = sumerian.MathUtils.smoothDamp(ctx.currentPoiY, target.y, ctx.poiTargetYStore, ctx.faceDetectionInterval/1000);
		ctx.currentPoiY = newY;

		// The POI target only moves in the xy plane.
		ctx.worldData.poiTarget.setTranslation(newX, newY, target.z);
	}
}

/**
 * Rotates the Host's body when the POI is updated.
 * Uses the same interval as the video input updates (args.faceDetectionRate).
 */
function rotateHostBody(ctx) {
	if (ctx.faceXLocation && ctx.faceYLocation) {
		ctx.prevHostRotation = ctx.hostRotation;

		const p = sumerian.MathUtils.clamp(ctx.faceXLocation / ctx.canvasOutputWidth, 0.0, 1.0);
		ctx.hostRotation = sumerian.MathUtils.lerp(p, ctx.hostBodyRotationMin, ctx.hostBodyRotationMax);
		
		ctx.hostAngularVelocity = ctx.hostRotation - ctx.prevHostRotation;
	}
}

/**
 * Interpolates the Host's rotation between face detection updates.
 * Called at each fixedUpdate()
 */
function addRotationToHostBody(args, ctx) {
	if (ctx.hostYRotation > ctx.hostBodyRotationMin && ctx.hostYRotation < ctx.hostBodyRotationMax) {
		ctx.worldData.host.addRotation(0, ctx.hostAngularVelocity * ctx.world.fixedTpf, 0);

		ctx.hostAngularVelocity *= (1 - args.hostRotationDamping);
	}
}

/**
 * Displays the face analysis information on the debug panel (MainScript.html)
 * @param {String} [emotion] The emotion returned from Amazon Rekognition
 * @param {float} [brightness] The brightness of the face returned from Amazon Rekognition
 * @param {float} [sharpness] The sharpness of the face returned from Amazon Rekognition
 */
function showFaceAnalysisData(emotion, brightness, sharpness, ctx) {
	if (ctx.entityData.emotionElement) {
		ctx.entityData.emotionElement.innerHTML = emotion;
	}

	if (ctx.entityData.brightness) {
		ctx.entityData.brightness.innerHTML = ctx.worldData.Utils.precisionRound(brightness, 1);
	}

	if (ctx.entityData.sharpness) {
		ctx.entityData.sharpness.innerHTML = ctx.worldData.Utils.precisionRound(sharpness, 1);
	}
}

/* Conversation */

/**
 * Sets initial greeting based on emotion returned from Amazon Rekognition
 * @param {String} [emotion] Emotion
 * @returns {String} Greeting
 */
function setContextByEmotion(ctx, emotion) {
	if (negativeEmotions.indexOf(emotion) !== -1) {
// 		song_id = '4qoaNnRQVDjX9zVplzghZB';// sad song
		//Retrieve from DDB 
		//TODO: random song_number
		getDataFromDynamo(ctx, ctx.worldData.usersTable, 'CALM', '2').then((data) => {
			song_id = data.track_id;
			ctx.spotify_iframe.src = "https://open.spotify.com/embed/track/" + song_id;
		});
		
		return negativeEmotionGreeting;
	} else {
// 		song_id = '5JqZ3oqF00jkT81foAFvqg';//happy song
		//Retrieve from DDB 
		//TODO: random song_number
		getDataFromDynamo(ctx, ctx.worldData.usersTable, 'HAPPY', '50').then((data) => {
			song_id = data.track_id;
			ctx.spotify_iframe.src = "https://open.spotify.com/embed/track/" + song_id;
		});
	
		return positiveEmotionGreeting;
	}
}

/**
 * Returns a Promise to resolve a DDB object. Ensure that you have a block to ensure data is returned appropriately.
 */
function getDataFromDynamo(ctx, tableName, mood, songNumber) {
	return new Promise((resolve, reject) => {
		const params = {
			TableName: tableName,
			Key: {
				"mood": {
					S: mood
				},
				"song_number":{
					N: songNumber
				}
			}
		};

		ctx.worldData.dynamodb.getItem(params, (err, data) => {
			if (err) {
				throw new Error(`Error getting user data from Amazon DynamoDB: ${err.name}. ${err.message}`);
			} else {
				const scheduleData = AWS.DynamoDB.Converter.unmarshall(data['Item']);
				resolve(scheduleData);
			}
		});
	})
}



/**
 * Speaks the "index"-th string in the list of conversation array
 * @param {Array} [conversationArray] Array of conversation spoken by the Host
 * @param {Integer} [index] Index of the array
 */
function invokeConversation(conversationArray, index, ctx) {
	if (index < conversationArray.length) {
		const greetingText = conversationArray[index] + '<break time="500ms"/>';
		
		ctx.entityData.Speech.playSpeech(greetingText);
	}
}

/**
 * Resets the interaction and returns to the initial welcome screen.
 */
function reset(args, ctx) {
	resetScreenForGreeting(args, ctx);

	ctx.changeToState(ctx.worldData.screenOptions.welcomeScreen);
}

/**
 * Resets the scene so the Host can greet again.
 * This also hides the map, as she suggests to show map at the end of the greeting.
 */
function resetScreenForGreeting(args, ctx) {
	sumerian.SystemBus.emit("concierge.hideMapEntity");
	ctx.hostSpeech.innerHTML = "";

	ctx.worldData.Utils.sleep(args.mapAnimationBufferTime).then(() => {
		ctx.convoCounter = ctx.initialConvoIndex;
	});
}

function setup(args, ctx) {
	// Ensure dependent scripts are loaded first
	if (!ctx.entityData.Speech) {
		ctx.worldData.Utils.printScriptDependencyError("MainScript", "Speech");
	}

	if (!ctx.worldData.Utils) {
		ctx.worldData.Utils.printScriptDependencyError("MainScript", "Utils");
	} else {
		ctx.worldData.Utils.clearError();
	}

	validateUserInputs(args, ctx);

	/**
	 * Screen states
	 * 
	 * All screen states share the same html script as defined by MainScript.html.
	 * They are differentiated by the visibility and contents of particular UI elements as well as if the map entity is shown.
	 */

	/**
	 * The welcome screen shows the title and hint.
	 */
	ctx.welcomeScreen = {
		enter() {
			ctx.worldData.Utils.showElementId(ctx.title);
			ctx.worldData.Utils.showElementId(ctx.introHintSection);

		},
		exit() {
			ctx.worldData.Utils.hideElementId(ctx.title);
			ctx.worldData.Utils.hideElementId(ctx.introHintSection);
		}
	}

	/**
	 * The greeting screen shows the caption for the Host's speech.
	 * At the end it also shows map UI's - this is handled by update().
	 */
	ctx.greetingScreen = {
		enter() {
			ctx.worldData.Utils.showElementId(ctx.hostSpeech);
		},
		exit() {
			ctx.worldData.Utils.hideElementId(ctx.hostSpeech);
		}
	}


	/**
	 * The face screen
	 */
	
	ctx.faceAnalyzeScreen = {
		enter() {
		},
		exit() {
		}
	}
	
	ctx.musicScreen = {
		enter() {
		},
		exit() {

		}
	}



	/**
	 * The idle screen shows the instructions to show map and related UI elements.
	 */
	ctx.idleScreen = {
		enter() {
			ctx.hostSpeech.innerHTML = idleSpeech;
			ctx.worldData.Utils.showElementId(ctx.hostSpeech);
			ctx.displayFaceAnalyzerUI();

		},
		exit() {
			ctx.hideFaceAnalyzerUI();


			ctx.worldData.Utils.hideElementId(ctx.hostSpeech);
		}
	}

	// Possible states
	ctx.worldData.screenOptions = {
		welcomeScreen: ctx.welcomeScreen,
		greetingScreen: ctx.greetingScreen,
		faceAnalyzeScreen: ctx.faceAnalyzeScreen,
		musicScreen: ctx.musicScreen,
		idleScreen: ctx.idleScreen
	}

	ctx.worldData.screenStates = {
		currentScreenState: ctx.worldData.screenOptions.welcomeScreen,
		previousScreenState: ctx.worldData.screenOptions.welcomeScreen,
	}

	/**
	 * Change screen states by setting the screen states and handling transitions using exit() and enter() defined in each state.
	 * If the newState is the previousScreenState, then it returns to the previous state.
	 * @param {Integer} [newState] The state the scene is trying to switch to
	 */
	ctx.changeToState = (newState) => {
		if (newState === ctx.worldData.screenStates.currentScreenState) {
			const newStateKey = ctx.worldData.Utils.findKeyOfObject(ctx.worldData.screenOptions, newState);
			throw new Error(`[Sumerian Concierge] The scene can't enter the ${newStateKey} state from itself.`);
		}

		ctx.worldData.screenStates.previousScreenState = ctx.worldData.screenStates.currentScreenState;
		ctx.worldData.screenStates.previousScreenState.exit();

		ctx.worldData.screenStates.currentScreenState = newState;
		ctx.worldData.screenStates.currentScreenState.enter();
	}

	//TODO:
	/**
	 * Displays the face hint and button contents to suggest check face expression.
	 */
	
	ctx.displayFaceAnalyzerUI = () => {
		ctx.worldData.Utils.showElementId(ctx.checkFaceButton);
		ctx.worldData.Utils.showElementId(ctx.faceHint);
	}
	/**
	 * Hides the face hint and button.
	 */
	ctx.hideFaceAnalyzerUI = () => {
		ctx.worldData.Utils.hideElementId(ctx.checkFaceButton);
		ctx.worldData.Utils.hideElementId(ctx.faceHint);
	}
	

	/**
	 * Displays the music hint and button 
	 */
	ctx.displayMusicUI = () => {
		ctx.worldData.Utils.showElementId(ctx.musicButton);

	}
	ctx.hideMusicUI = () => {
		ctx.worldData.Utils.hideElementId(ctx.musicButton);
	
	}
	ctx.displaySpotifyUI = () => {
		ctx.worldData.Utils.showElementId(ctx.spotify);

	}
	ctx.hideSpotifyUI = () => {
		ctx.worldData.Utils.hideElementId(ctx.spotify);
	
	}
	
	
	
	
	/* Debug panel */

	// Only render the webcam input when the debug panel is shown.
	ctx.worldData.isShowingDebugPanel = false;

	ctx.entityData.emotionElement = document.getElementById("emotionElement");
	ctx.entityData.brightness = document.getElementById("brightness");
	ctx.entityData.sharpness = document.getElementById("sharpness");

	/* Video */

	ctx.videoInput = document.getElementById('videoInput');

	// Canvas used for sending input to web worker
	ctx.canvasInput = document.getElementById('canvasInput');
	ctx.canvasInputContext = ctx.canvasInput.getContext('2d');

	// Canvas used to draw the webcam input.
	// The webcam input is drawn at the same interval as the face detection
	ctx.canvasOutput = document.getElementById('canvasOutput');
	ctx.canvasOutputContext = ctx.canvasOutput.getContext('2d');

	ctx.canvasOutputWidth = ctx.canvasOutput.width;
	ctx.canvasOutputHeight = ctx.canvasOutput.height;

	ctx.invCanvasOutputWidth = 1.0 / ctx.canvasOutputWidth;
	ctx.invCanvasOutputHeight = 1.0 / ctx.canvasOutputHeight;

	ctx.faceRectCanvas = document.getElementById('canvasFaceRect');
	ctx.faceRectCanvasContext = ctx.faceRectCanvas.getContext('2d');
	ctx.faceRectCanvasWidth = ctx.faceRectCanvas.width;
	ctx.faceRectCanvasHeight = ctx.faceRectCanvas.height;

	ctx.worldData.Utils.startCamera('videoInput', args.faceDetectionRate);

	/**
	 * Face detection
	 * 
	 * The face detection algorithms are run in the web worker and communicate back to the main thread with face detection or emotion analysis results.
	 * 
	 * (1) Use jsfeat to detect if there is a face in the screen.
	 * (2) Switch to Amazon Rekognition to get emotion analysis if there is a face after the user greets the Host, so the Host can respond to the emotion analysis result.
	 * (3) Then revert back to using jsfeat after setInitialGreeting() as the emotion analysis is no longer used in this scene.
	 * (4) If there is no face, then keep using jsfeat
	 * 
	 * These decision points are marked in the appropriate functions in this file.
	 * 
	 *              |--> (2) (if face exists) -- Amazon Rekognition ------------------> (3) jsfeat
	 *              |                            (while ctx.requestEmotion = true)
	 * (1) jsfeat --|
	 *              |-----------------------------------------------------------------> (4) jsfeat
	 */

	// Use the video frame's input string for Amazon Rekognition.
	ctx.videoFrameInputString = null;

	// Use the video frame's image data for jsfeat.
	ctx.videoFrameImageData = null;

	ctx.emotion = null;

	// Use this flag to indicate when emotion analysis is needed.
	ctx.requestEmotion = false;
	
	// Use this flag to indicate when show music.
	ctx.showMusic = false;

	ctx.jsfeat = {
		exit() {
			ctx.videoFrameImageData = null; 
		}
	}

	ctx.rekognition = {
		exit() {
			ctx.videoFrameInputString = null; 
		}
	}

	// Two options for face detection algorithm. Only one is used at any time.
	ctx.faceDetectionAlgorithmOptions = {
		jsfeat: ctx.jsfeat,
		rekognition: ctx.rekognition
	}

	// Current face detection algorithm
	ctx.faceDetectionAlgorithm = ctx.faceDetectionAlgorithmOptions.jsfeat;

	/**
	 * Switch to the other face detection algorithm.
	 * @param {Object} newOption The face detection algorithm option object to switch to
	 */
	ctx.changeFaceDetectionAlgorithmTo = (newOption) => {
		if (!newOption) {
			throw new Error(`[Sumerian Concierge] The face detection option does not exist.`);
		} else if (newOption === ctx.faceDetectionAlgorithm) {
			const newCVLibrary = ctx.worldData.Utils.findKeyOfObject(ctx.faceDetectionAlgorithmOptions, newOption);
			throw new Error(`[Sumerian Concierge] The scene is already using the face detection algorithm, ${newCVLibrary}.`);
		} else {
			ctx.faceDetectionAlgorithm.exit();
			ctx.faceDetectionAlgorithm = newOption;
		}
	}

	/* POI */

	// Rotate around the Y-axis
	ctx.hostYRotation = ctx.worldData.host.getRotation().getComponent(1);
	ctx.hostBodyRotationMin = sumerian.MathUtils.radFromDeg(args.hostBodyRotationMin);
	ctx.hostBodyRotationMax = sumerian.MathUtils.radFromDeg(args.hostBodyRotationMax);

	// Coordinate of the center point of the face
	ctx.faceXLocation = null;
	ctx.faceYLocation = null;

	// Store POI target data for smoothly changing the POI target position
	ctx.poiTargetXStore = new sumerian.Vector2();
	ctx.currentPoiX = ctx.worldData.poiTarget.getTranslation().x;

	ctx.poiTargetYStore = new sumerian.Vector2();
	ctx.currentPoiY = ctx.worldData.poiTarget.getTranslation().y;

	ctx.targetPOIPosition = null;

	/* Host body rotation */

	ctx.prevHostRotation = 0.0;
	ctx.hostRotation = 0.0;
	ctx.hostAngularVelocity = 0.0;

	/* Speech */

	ctx.hostSpeech = document.getElementById("hostSpeech");
	ctx.hostSpeech.innerHTML = "";

	// There are two sets of scripts before starting to speak the conversation array.
	ctx.initialConvoIndex = -2;
	ctx.convoCounter = ctx.initialConvoIndex;

	/* UI & close caption */

	ctx.title = document.getElementById("title");
	ctx.introHintSection = document.getElementById("introHintSection");
	ctx.startButton = document.getElementById("startButton");
	ctx.mainTextContent = document.getElementById("mainTextContent");

	///* Face */
	ctx.checkFaceButton = document.getElementById("faceButton");
	ctx.faceHint = document.getElementById("faceHint");
	
	ctx.musicButton = document.getElementById("musicButton");
	ctx.musicHint = document.getElementById("musicHint");
	ctx.spotify = document.getElementById("spotifySection");
	ctx.spotify_iframe = document.getElementById("spotify_iframe");

	ctx.worldData.infoButton = document.getElementById("infoButton");
	ctx.worldData.closeInfoButton = document.getElementById("closeInfoButton");

	ctx.infoHint = document.getElementById("infoHint");
	ctx.infoContent = document.getElementById("infoContent");


	/**
	 * Web Worker
	 * 
	 * We use an "inline" web worker using Blob.
	 * The web worker focuses on face detection and emotion analysis so the main thread can focused on rendering and handling user inputs.
	 */
	ctx.blob = new Blob([ '(',
		function() {
			// Override keyword 'window' in jsfeat so we can use this library in web worker.
			self.window = self;

			let awsSDKReady = false;
			let rekognition = null;

			let timeoutCountDown = null;
			let timeUntilTimeout = null;

			const drawWebCamInput = {'cmd': 'drawWebcamInput', 'message': null};
			const useJsfeat = {'cmd': 'noFaceFromRekognition', 'message': null};
			// Handles messages from the main thread
			self.addEventListener('message', (e) => {
				const data = e.data;
				switch(data.cmd) {
					case "setParameters":
						setParametersFromMainThread(e.data.msg);
						break;
					case "sendVideoFrameStringToRekognition":
						if (awsSDKReady) {
							detectFaceBoundaryAndEmotion(e.data.msg);
						}
						break;
					case "sendVideoFrameDataToJsfeat":
						if (awsSDKReady) {
							detectFaceBoundary(e.data.msg);
						}
						break;
					default:
						throw new Error(`There is no command with the name ${data.cmd}`);
				}
			}, false);

			/**
			 * Passes AWS configuration from the IDE and instantiate AWS classes
			 * @param {Object} [data] The parameters sent from the main thread
			 */
			function setParametersFromMainThread(data) {
				try {
					// importScripts is synchronous
					self.importScripts(data.awsSdk);

					// Use jsfeat for face detection
					self.importScripts(data.jsfeatUrl);
					self.importScripts(data.frontalFaceUrl);

					AWS.config.credentials = new AWS.CognitoIdentityCredentials({ IdentityPoolId: data.cognitoIdentityPoolId });
					AWS.config.region = data.region;

					rekognition = new AWS.Rekognition();

					timeUntilTimeout = data.timeUntilTimeout;

					awsSDKReady = true;
				} catch(err) {
					throw new Error(`Error setting parameters in the web worker from the main thread: ${err.name}. ${err.message}`);
				}
			}

			/**
			 * Runs jsfeat's face detection algorithm on image data of a video frame from the main thread.
			 * 
			 * @param {ImageData} [videoFrameInputData] Image input (pixel data) from the webcam
			 */
			function detectFaceBoundary(videoFrameInputData) {
				try {
					let closestFaceBoundary = getClosestFace(videoFrameInputData);
					self.postMessage(drawWebCamInput);

					if (closestFaceBoundary) {
						const closestFaceResult = {'cmd': 'closestFace', 'message': closestFaceBoundary};
						self.postMessage(closestFaceResult);

						// Cancel time out if there is a face
						if (timeoutCountDown) {
							clearTimeout(timeoutCountDown);
							timeoutCountDown = null;
						}
					// Face detection time out
					} else if (!timeoutCountDown) {
						timeoutCountDown = setTimeout(() => {
							const timedOut = {'cmd': 'timeOut', 'message': null};
							self.postMessage(timedOut);
						}, timeUntilTimeout);
					}
				} catch (err) {
					throw new Error(`Error processing video frame data for jsfeat in the web worker: ${err.name}. ${err.message}`);
				}
			}

			/**
			 * Face detection using jsfeat.
			 * The code below is based on HARR face detect demo: https://inspirit.github.io/jsfeat/sample_haar_face.html
			 * Please refer to jsfeat's documentation for explanations on functions below.
			 * @param {ImageData} [videoFrameImageData] The webcam feed as ImageData object
			 * @returns {Object} Closest face in the webcam space.
			 */
			function getClosestFace(videoFrameImageData) {
				const w = videoFrameImageData.width;
				const h = videoFrameImageData.height;

				const classifier = jsfeat.haar.frontalface;

				const options = {
					min_scale : 2,
					scale_factor : 1.15,
					use_canny : false,
					edges_density : 0.13,
					equalize_histogram : true
				}

				let img_u8 = new jsfeat.matrix_t(w, h, jsfeat.U8_t | jsfeat.C1_t);
				let ii_sum = new Int32Array((w+1)*(h+1));
				let ii_sqsum = new Int32Array((w+1)*(h+1));
				let ii_tilted = new Int32Array((w+1)*(h+1));
				let ii_canny = new Int32Array((w+1)*(h+1));
			
				jsfeat.imgproc.grayscale(videoFrameImageData.data, w, h, img_u8);
				
				jsfeat.imgproc.compute_integral_image(img_u8, ii_sum, ii_sqsum, null);

				let rects = jsfeat.haar.detect_multi_scale(ii_sum, ii_sqsum, ii_tilted, options.use_canny? ii_canny : null, img_u8.cols, img_u8.rows, classifier, options.scale_factor, options.min_scale);
				rects = jsfeat.haar.group_rectangles(rects, 1);

				return rects[0];
			}

			/**
			 * Processes image input string from the main thread for Amazon Rekognition.
			 * @param {String} [videoFrameInputString] Image input from the webcam
			 */
			function detectFaceBoundaryAndEmotion(videoFrameInputString) {
				try {
					analyzeVideoFrameString(videoFrameInputString);
				} catch (err) {
					// Switch back to jsfeat if there is an error running Rekognition
					self.postMessage(useJsfeat);

					throw new Error(`Error processing video frame data for Amazon Rekognition in the web worker. Using JSFeat for face detection instead. ${err.name}. ${err.message}`);
				}
			}

			/**
			 * Runs face detection to get emotion of the closest face in the webcam feed.
			 * Uses Amazon Rekognition.
			 * Send message to switch back to jsfeat if there's no face
			 * @param {String} [videoFrameInputString] Image input from the webcam
			 */
			function analyzeVideoFrameString(videoFrameInputString) {
				rekognitionDetectFaces(videoFrameInputString, (faces) => {
					self.postMessage(drawWebCamInput);

					if (faces && faces.length > 0) {
						const closestFaceResult = {'cmd': 'closestFace', 'message': faces[0].BoundingBox};
						self.postMessage(closestFaceResult);

						analyzeFace(faces[0]);
					} else {
						// Switch back to jsfeat if there is no face
						self.postMessage(useJsfeat);
					}
				});
			}

			/**
			 * Analyzes a face for emotion and image quality using Amazon Rekognition
			 * @param {Object} [face] Closest face found by Amazon Rekognition
			 */
			function analyzeFace(face) {
				const emotion = getEmotion(face.Emotions);
				const imageQuality = face.Quality;

				const rekOutput = { 'emotion' : emotion, 'imageQuality' : imageQuality };
				const rekAnalysisResult = { 'cmd': 'rekAnalysis', 'message' : rekOutput };

				self.postMessage(rekAnalysisResult);
			}

			/**
			 * Use Amazon Rekognition's detect faces algorithm to get face details including emotion.
			 * @param {String} [videoFrameInputString] Image input from the webcam
			 * @param {Function} [callback] The callback function. Passes 'FaceDetails' returned from Amazon Rekognition.
			 */
			function rekognitionDetectFaces(videoFrameInputString, callback) {
				const params = {
					Image: {
						Bytes: getBinary(videoFrameInputString)
					},
					Attributes: ["ALL"]
				};

				rekognition.detectFaces(params, (err, data) => {
					if (err) {
						throw new Error(`Error detecting face with Rekognition: ${err.name}. ${err.message}`);
					} else {
						callback(data.FaceDetails);
					}
				});
			};

			/**
			 * Gets the emotion with the highest confidence from Amazon Rekognition.
			 * See the list of emotions at https://docs.aws.amazon.com/rekognition/latest/dg/API_Emotion.html
			 * @param {Array} [emotions] Emotions returned from Amazon Rekognition
			 * @returns {String} Emotion with the highest confidence
			 */
			function getEmotion(emotions) {
				let emotion = null;
				for (let i = 0, len = emotions.length; i < len; i++) {
					if (i == 0 || emotions[i].Confidence > emotion.Confidence) {
						emotion = emotions[i];
					}
				}
				return emotion.Type;
			}

			/**
			 * Decodes a string of data which has been encoded using base-64 encoding.
			 * and returns URL for the image in binary format.
			 * @param {String} [encodedFile] Input string
			 * @returns {Blob} Array buffer
			 */
			function getBinary(encodedFile) {
				const base64Image = encodedFile.split("data:image/jpeg;base64,")[1];
				const binaryImg = self.atob(base64Image);
				const length = binaryImg.length;
				const ab = new ArrayBuffer(length);
				const ua = new Uint8Array(ab);
				for (let i = 0; i < length; i++) {
					ua[i] = binaryImg.charCodeAt(i);
				}

				return ab;
			}
		}.toString(),
		')()'], { type: 'application/javascript' }
	);

	if (window.Worker) {
		// Obtain a blob URL reference to our worker 'file'.
		ctx.workerBlobURL = window.URL.createObjectURL(ctx.blob);
		ctx.worker = new Worker(ctx.workerBlobURL);

		/**
		 * Handles messages from the worker in the main thread.
		 * @param {Object} [e] Event
		 */
		ctx.workerEventHandlers = (e) => {
			const data = e.data;
			switch (data.cmd) {
				// Handle face detection result (there is a face) for both jsfeat and Amazon Rekognition
				case 'closestFace':
					// (2) in the face detection diagram above.
					// While emotion analysis is needed, switch to using Amazon Rekognition if there is a face (i.e. closestFace message is received from the web worker here).
					// We ensure that this switch happens only once by checking to see if the face detection algorithm has changed to rekognition yet
					// since 'closestFace' message will be emitted from the worker as long as there is a face in the webcam space.
					if (ctx.requestEmotion && ctx.faceDetectionAlgorithm === ctx.faceDetectionAlgorithmOptions.jsfeat) {
						ctx.changeFaceDetectionAlgorithmTo(ctx.faceDetectionAlgorithmOptions.rekognition);
					}

					// Draw the rectangle around the closest face.
					const closestFace = data.message;

					// jsfeat || Rekognition results
					// The bounding box from Rekognition is returned as a ratio of the image width and height.
					const bbLeft = closestFace.x || closestFace.Left * ctx.canvasOutputWidth;
					const bbTop = closestFace.y || closestFace.Top * ctx.canvasOutputHeight;
					const bbWidth = closestFace.width || closestFace.Width * ctx.canvasOutputWidth;
					const bbHeight = closestFace.height || closestFace.Height * ctx.canvasOutputHeight;

					ctx.faceXLocation = bbLeft + bbWidth / 2;
					ctx.faceYLocation = bbTop + bbHeight / 2;

					if (ctx.faceRectCanvas && ctx.faceRectCanvasContext) {
						ctx.worldData.Utils.drawRectangle(ctx.faceRectCanvasContext, "red", bbLeft, bbTop, bbWidth, bbHeight, ctx.faceRectCanvasWidth, ctx.faceRectCanvasHeight);
					}

					// Move POI bounds and rotate the Host's body based on the face detection results.
					if (ctx.worldData.POIBounds) {
						ctx.targetPOIPosition = getHostPOITargetPosition(ctx.faceXLocation, ctx.faceYLocation, ctx.worldData.POIBounds, ctx);
						rotateHostBody(ctx);
					}
					break;
				case 'drawWebcamInput':
					// Draw webcam stream whether there is a face in the webcam space or not.
					// Recommended to emit this message as close as possible to the timing of when face detection result is available to help determine accuracy of face detection algorithm.
					if (ctx.worldData.isShowingDebugPanel) {
						ctx.worldData.Utils.showElementId(ctx.videoInput);
						if (ctx.faceDetectionAlgorithm === ctx.faceDetectionAlgorithmOptions.jsfeat) {
							ctx.worldData.Utils.drawImageData(ctx.videoFrameImageData, ctx.canvasOutputContext, ctx.canvasOutputWidth, ctx.canvasOutputHeight);
						} else if (ctx.faceDetectionAlgorithm === ctx.faceDetectionAlgorithmOptions.rekognition) {
							ctx.worldData.Utils.showImageStringToCanvas(ctx.videoFrameInputString, ctx.canvasOutputContext);
						}
					}
					break;
				case 'rekAnalysis':
					ctx.emotion = data.message.emotion;
					if (ctx.worldData.isShowingDebugPanel) {
						const brightness = data.message.imageQuality.Brightness;
						const sharpness = data.message.imageQuality.Sharpness;

						showFaceAnalysisData(ctx.emotion, brightness, sharpness, ctx);
					}
					break;
				case 'noFaceFromRekognition':
					if (ctx.faceDetectionAlgorithm !== ctx.faceDetectionAlgorithmOptions.jsfeat) {
						ctx.changeFaceDetectionAlgorithmTo(ctx.faceDetectionAlgorithmOptions.jsfeat);
					}
					break;
				case 'timeOut':
					if (!ctx.entityData.Speech.isSpeaking && ctx.worldData.screenStates.currentScreenState !== ctx.worldData.screenOptions.welcomeScreen) {
						reset(args, ctx);
					}
					break;
				default:
					throw new Error(`The ${data.cmd} worker event does not exist!`);
			}
		}

		ctx.worker.addEventListener('message', ctx.workerEventHandlers, false);
	}

	/* Event Listeners */

	/**
	 * Send the image to the webworker at a fixed interval when the webcam starts.
	 */
	ctx.onVideoStarted = () => {
		try {
			ctx.sendVideoFrameToWorkerAtInterval = window.setInterval(() => { 
				sendVideoFrameToWorker(ctx);
			}, ctx.faceDetectionInterval);
		} catch (err) {
			stopVideo(ctx);
			throw new Error(`Error starting video: ${err.name}. ${err.message}`);
		}
	}

	/**
	 * Posts message to the web worker from the main thread, including AWS credentials.
	 */
	ctx.setResources = () => {
		const awsSystem = ctx.world.getSystem("AwsSystem");
		const paramsToWorker = {
			'cmd': 'setParameters',
			'msg': {
				cognitoIdentityPoolId: awsSystem.cognitoIdentityPoolId,
				region: awsSystem.region,
				awsSdk: awsSystem.sdk,
				timeUntilTimeout: ctx.timeUntilTimeout,
				jsfeatUrl: args.jsfeatUrl,
				frontalFaceUrl: args.frontalFaceUrl
			}
		}
		
		ctx.worker.postMessage(paramsToWorker);
	}

	/**
	 * Handles responses from Amazon Lex.
	 * Uses the intent names to handle events.
	 * @param {Object} [data] The data returned from Amazon Lex
	 */
	ctx.onLexResponse = (data) => {
		const msg = data.message;

		switch(data.intentName) {
			case "Greeting":
				ctx.startButton.click();
				break;
			case "Info":
				ctx.worldData.infoButton.click();
				break;
			case "CloseInfo":
				// Panel toggling is handled by the State Machine behavior "Info Screen Behavior".
				ctx.worldData.closeInfoButton.click();
				break;
			case "ThankYou":
				ctx.entityData.Speech.playSpeech(msg);
				break;
			case "CheckExpression":
				ctx.checkFaceButton.click();
				break;
			default:
				const index = ctx.worldData.Utils.getRandomInt(clarificationSpeeches.length);
				ctx.entityData.Speech.playSpeech(clarificationSpeeches[index]);
		}
	}

	/**
	 * Handles the event emitted from the "Toggle Debug Panel Behavior" in the State Machine.
	 */
	ctx.onShowDebugPanel = () => {
		ctx.worldData.isShowingDebugPanel = true;
		
	};

	/**
	 * Handles the event emitted from the "Toggle Debug Panel Behavior" in the State Machine.
	 */
	ctx.onHideDebugPanel = () => {
		ctx.worldData.isShowingDebugPanel = false;
	};

	/**
	 * Change to the Greeting screen.
	 */
	ctx.startGreeting = () => {
		ctx.changeToState(ctx.worldData.screenOptions.greetingScreen);
	}


	/**
	 * Change to the check face screen.
	 */
	ctx.onCheckFace = () => {
		ctx.changeToState(ctx.worldData.screenOptions.faceAnalyzeScreen);
	}
	/**
	 * Change to the music screen.
	 * The map transition animation is handled by the State Machine's 'Map Behavior' behavior.
	 */
	ctx.onShowMusic = () => {
		ctx.changeToState(ctx.worldData.screenOptions.musicScreen);
	}

	/**
	 * Handles concierge.onHideTextForMapInteraction event from the State Machine.
	 * The text content width is resized after the map is shown.
	 * The html overlay prevents the pick event to pass through, so we reduce the text div width.
	 */
	ctx.onHideTextForMapInteraction = () => {
		// Convert float to percent
		ctx.mainTextContent.style.width = args.textWidthForMap + "%";
	}

	
	/**
	 * Emits event accordingly when the map button is pressed.
	 */
	//TODO
	ctx.toggleMusicClickEvent = () => {
		if (ctx.worldData.screenStates.currentScreenState !== ctx.worldData.screenOptions.musicScreen) {
			// call musicSpeech
			ctx.entityData.Speech.playSpeech(musicSpeech);
			// show song widget
			ctx.worldData.Utils.hideElementId(ctx.worldData.infoButton);
		
			ctx.hideMusicUI();
			ctx.displaySpotifyUI();
			
		} else {
			sumerian.SystemBus.emit("concierge.hideMusicEvent"); // need to implement
		}
	}


	ctx.worldData.dynamodb = null;
	ctx.worldData.usersTable = args.usersTable;

	sumerian.SystemBus.addListener('aws.sdkReady', () => {
		ctx.worldData.dynamodb = new AWS.DynamoDB();
		ctx.setResources();
	}, true);

	ctx.musicButton.addEventListener("click", ctx.toggleMusicClickEvent);
	ctx.startButton.addEventListener("click", ctx.startGreeting);
	ctx.checkFaceButton.addEventListener("click", ctx.onCheckFace);

	sumerian.SystemBus.addListener("concierge.videoCanPlay", ctx.onVideoStarted);
	sumerian.SystemBus.addListener("concierge.lexResponseEvent", ctx.onLexResponse);
	sumerian.SystemBus.addListener("concierge.showMusicEvent", ctx.onShowMusic);
	sumerian.SystemBus.addListener("concierge.hideMusicEvent", ctx.onHideMusic);

	/**
	 * Listens to events from the "Toggle Debug Panel Behavior".
	 */
	sumerian.SystemBus.addListener("concierge.showDebugPanelEvent", ctx.onShowDebugPanel);
	sumerian.SystemBus.addListener("concierge.hideDebugPanelEvent", ctx.onHideDebugPanel);

	/**
	 * Listens to events from the "Map Behavior" in the State Machine.
	 */
	sumerian.SystemBus.addListener("concierge.hideTextOverlayOnMapEvent", ctx.onHideTextForMapInteraction);

};

function fixedUpdate(args, ctx) {
	if (ctx.faceXLocation && ctx.faceYLocation) {
		addRotationToHostBody(args, ctx);
		smoothDampHostPOI(ctx.targetPOIPosition, ctx);
	}
};

function update(args, ctx) {
	if (!ctx.entityData.Speech.isSpeaking && ctx.worldData.screenStates.currentScreenState === ctx.worldData.screenOptions.greetingScreen) {
		// Using an array of conversation string to pace the conversation and close caption
		if (ctx.convoCounter <= conversation.length) {
			if (ctx.convoCounter === ctx.initialConvoIndex) {
				const tod = "Good " + ctx.worldData.Utils.getTimeofDay();
				ctx.entityData.Speech.playSpeech(tod + ", " + greeting);
			} else if (ctx.convoCounter === ctx.initialConvoIndex + 1) {

				// Switch back to using JSFeat for face detection if it was using Rekognition for emotion analysis.
				if (ctx.faceDetectionAlgorithm === ctx.faceDetectionAlgorithmOptions.rekognition) {
					ctx.changeFaceDetectionAlgorithmTo(ctx.faceDetectionAlgorithmOptions.jsfeat);
				}
			} else if (ctx.convoCounter === conversation.length) {
				ctx.entityData.Speech.playSpeech(idleSpeech);

				ctx.displayFaceAnalyzerUI();
				ctx.requestEmotion = true;

			} else {
				invokeConversation(conversation, ctx.convoCounter, ctx);
			}

			ctx.convoCounter++;
		}
	}
	

	// for face analyzing
	if (!ctx.entityData.Speech.isSpeaking && ctx.worldData.screenStates.currentScreenState === ctx.worldData.screenOptions.faceAnalyzeScreen && ctx.requestEmotion == true){
		// Using an array of conversation string to pace the conversation and close caption
		let feedback = setContextByEmotion(ctx,ctx.emotion);
		//TODO: play face analysis here
		ctx.worldData.Utils.showElementId(ctx.hostSpeech);
		ctx.entityData.Speech.playSpeech(feedback);

		// (3) in the face detection diagram above.
		// No longer need emotion analysis after the initial greeting.
		ctx.requestEmotion = false;
		ctx.showMusic = true;


		// Switch back to using JSFeat for face detection if it was using Rekognition for emotion analysis.
		if (ctx.faceDetectionAlgorithm === ctx.faceDetectionAlgorithmOptions.rekognition) {
			ctx.changeFaceDetectionAlgorithmTo(ctx.faceDetectionAlgorithmOptions.jsfeat);
		}
		
		ctx.hideFaceAnalyzerUI();
		ctx.onShowMusic();
	}
	
	// for displaying music
	if (!ctx.entityData.Speech.isSpeaking && ctx.worldData.screenStates.currentScreenState === ctx.worldData.screenOptions.musicScreen && ctx.showMusic == true){
	
		ctx.showMusic = false;
		ctx.worldData.Utils.hideElementId(ctx.hostSpeech);
		ctx.displaySpotifyUI();	
	}
};

function cleanup(args, ctx) {
	stopVideo(ctx);

	if (ctx.worker) {
		ctx.worker.terminate();
		URL.revokeObjectURL(ctx.workerBlobURL);
		ctx.worker.removeEventListener('message', ctx.workerEventHandlers, false);
	}

	ctx.musicButton.removeEventListener("click", ctx.toggleMusicClickEvent);
	ctx.startButton.removeEventListener("click", ctx.startGreeting);
	ctx.checkFaceButton.removeEventListener("click", ctx.onCheckFace);

	sumerian.SystemBus.removeListener("concierge.videoCanPlay", ctx.onVideoStarted);
	sumerian.SystemBus.removeListener("concierge.lexResponseEvent", ctx.onLexResponse);
	sumerian.SystemBus.removeListener("concierge.showMusicEvent", ctx.onShowMusic);
	sumerian.SystemBus.removeListener("concierge.hideMusicEvent", ctx.onHideMusic);

	/**
	 * Removes events from the "Toggle Debug Panel Behavior".
	 */
	sumerian.SystemBus.removeListener("concierge.showDebugPanelEvent", ctx.onShowDebugPanel);
	sumerian.SystemBus.removeListener("concierge.hideDebugPanelEvent", ctx.onHideDebugPanel);

	/**
	 * Removes events from the "Map Behavior" in the State Machine.
	 */
	sumerian.SystemBus.removeListener("concierge.hideTextOverlayOnMapEvent", ctx.onHideTextForMapInteraction);

	/**
	 * Removes events from the "Info Button Behavior" in the State Machine.
	 */
	sumerian.SystemBus.removeListener("concierge.showInfoEvent", ctx.onShowInfoScreen);
	sumerian.SystemBus.removeListener("concierge.hideInfoEvent", ctx.onHideInfoScreen);
};

/**
 * Validates user inputs and converts user inputs for time to milliseconds.
 */
function validateUserInputs(args, ctx) {
	if (!args.usersTable) {
		sumerian.SystemBus.emit("sumerian.warning", { title: "Please provide Amazon DynamoDB users table name on 'MainScripts.js'", message: "Please specify the Amazon DynamoDB users table name on the inspector panel of 'MainScripts.js' on the 'Main Script' entity."});
	}

	if (!args.map) {
		sumerian.SystemBus.emit("sumerian.warning", { title: "Please specify the map entity on 'MainScripts.js'", message: "Please specify the map entity on the inspector panel of 'MainScripts.js' on the 'Main Script' entity. By default, this entity is called 'Map', and you can drag and drop the entity onto the inspector panel of the script file"});
	}

	ctx.faceDetectionInterval = 1000 / args.faceDetectionRate;
	ctx.timeUntilTimeout = args.timeUntilTimeout * 1000;

	if (ctx.timeUntilTimeout <= ctx.faceDetectionInterval) {
		console.error(`The scene times out more frequently than the interval at which it runs face detection. Consider changing the 'face detection rate' or 'face detection timeout' values.`);
	}

	if (args.jsfeatUrl === "") {
		sumerian.SystemBus.emit("sumerian.warning", { title: "Missing jsfeat URL", message: "Please specify the URL for the location where jsfeat's code base is hosted."});
	}

	if (args.frontalFaceUrl === "") {
		sumerian.SystemBus.emit("sumerian.warning", { title: "Missing jsfeat frontal face URL", message: "Please specify the URL for the location where jsfeat's frontal face file is hosted."});
	}
}

var parameters = [
	{
		name: 'DynamoDB users table',
		key: 'usersTable',
		type: 'string',
		default: 'SumerianConciergeExperienceUsers',
		description: "DynamoDB users table name"
	},
	{
		name: 'Face detection rate (per second)',
		key: 'faceDetectionRate',
		type: 'int',
		default: 2,
		description: "The number of times the face detection algorithm is run per second. Consider the trade off between the cost of running AWS services in the web worker and the Host's responsiveness to face detection such as for POI and emotion detection."
	},
	{
		name: 'Face detection timeout (s)',
		key: 'timeUntilTimeout',
		type: 'float',
		default: 600,
		description: "Time in seconds until face detection resets. The default is 10 minutes."
	},
	{
		name: 'Map entity',
		key: 'map',
		type: 'entity',
		description: "Drop the Map entity here. By default, it's called 'Map' on the Entities list."
	},
	{
		name: 'Text width (%) for map screen',
		key: 'textWidthForMap',
		type: 'int',
		control: 'slider',
		min: 20,
		max: 50,
		exponential: false,
		default: 35,
		description: "Resize the text width during the map screen if needed, so the html overlay does not prevent the Sumerian pick event to pass through to the 3D entities."
	},
	{
		name: 'Transition time from map screen',
		key: 'mapAnimationBufferTime',
		type: 'int',
		default: 3500,
		description: "The length should be slightly longer than the animation time set up in the State Machine's 'Map Behavior' behavior  > 'Move map out of screen' state. The default is 3500ms."
	},
	{
		name: 'Host minimum body rotation',
		key: 'hostBodyRotationMin',
		type: 'float',
		default: -30,
		description: "The minimum rotation value in degrees around the Y-axis for the Host's body when the user is on the left-hand side of the screen. Negative value results in the Host rotating counter-clockwise, and positive value rotating clock-wise."
	},
	{
		name: 'Host maximum body rotation',
		key: 'hostBodyRotationMax',
		type: 'float',
		default: 0,
		description: "The maximum rotation value in degrees around the Y-axis for the Host's body when the user is on the left-hand side of the screen. Negative value results in the Host rotating counter-clockwise, and positive value rotating clock-wise."
	},
	{
		name: 'Damping speed for host rotation',
		key: 'hostRotationDamping',
		type: 'float',
		control: 'slider',
		min: 0,
		max: 1,
		exponential: false,
		default: 0.05,
		description: "The amount to dampen the Host's rotation."
	},
	{
		name: 'Jsfeat code base URL',
		key: 'jsfeatUrl',
		type: 'string',
		description: "The URL for where the jsfeat's code base is hosted."
	},
	{
		name: 'Jsfeat frontal face file URL',
		key: 'frontalFaceUrl',
		type: 'string',
		description: "The URL for where the jsfeat's frontal face file is hosted."
	}
];