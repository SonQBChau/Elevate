'use strict';
	
/* global sumerian */

var BlinkType = {
    slow : 0,
    med : 1,
    fast : 2
};

var BlinkLayerName = '__Blink__';
	
var setup = function (args, ctx) {
	// Called when play mode starts.
	ctx.entityData.forceBlink = false;
	ctx.entityData.blinkTimer = 0;
	ctx.entityData.isBlinking = false;
	ctx.entityData.BlinkSpacing = args.BlinkSpacing;
	ctx.BlinkSpeed = args.BlinkSpeed;

	ctx.entityData.blinkAnims = {
		slow : [],
		med : [],
		fast : []
	}

	ctx.entityData.blinkLayer = findLayerByName(ctx.entity.animationComponent, BlinkLayerName);
	getBlinkAnims(ctx.entityData.blinkAnims, ctx.entityData.blinkLayer);

	ResetTimer(ctx);
	ctx.entityData.blink = blink;
	let hostEntity = ctx.entity.parent().first();
	let eyelidRegex = hostEntity.getComponent('HostComponent')._hostConfig
.pointOfInterest.eyelidRegEx;
	let skeleton = ctx.entity.animationComponent._skeletonPose._skeleton;
	ctx.eyelidJoints = findJointsByRegex(skeleton, eyelidRegex);
	ctx.eyelidDistance = getBindDistance(ctx.entity.animationComponent, ctx.eyelidJoints, 'y');
};

/**
  * Finds the Joints in a Skeleton whose names match the regular expression
  * @param {Skeleton} [skeleton] asset to search
  * @param {string} [regex] regular expression
  * @returns {Array<Joint>} 
  */
function findJointsByRegex( skeleton, regex ) {
	let joints = skeleton._joints;
	var ret = [];
	
	for (let i in joints) {
		if (joints[i]._name.search(regex) != -1) {
			ret.push(joints[i]);
		}
	}
	
	return ret;
}

/**
  * Finds the maximum distance between joints on the base layer along a local axis
  * @param {Array<Joint>} [joints] array of joints
  * @param {string} [axis] name of axis to compare
  * @returns {float} 
  */
function getBindDistance( animComp, joints, axis ) {
	let axisIndex = ['x','y','z'].indexOf(axis);
	let axisValues = [];
	let clip = animComp.layers[0].getStateById(animComp.layers[0].getStates()[0])._sourceTree._clip;
	
	let jointIDs = [];
	for (let i in joints) {
		jointIDs.push(joints[i]._index);
	}
	
	let channels = clip._channels;
	channels = channels.filter(function(c) {
		return jointIDs.includes(c._jointIndex);
	})
	
	for (let channelName in channels) {
		let channel = channels[channelName];
		axisValues.push(channel._translations[axisIndex]);
	}
	
	axisValues.sort();
	
	return Math.abs(axisValues[axisValues.length-1] - axisValues[0]);
}

/**
  * Finds current maximum distance between joints' positions along a local axis
  * @param {AnimationComponent} [animComp] animation component to evaluate
  * @param {Array<Joint>} [joints] array of joints
  * @param {string} [axis] name of axis to compare
  * @returns {float} 
  */
function getCurrentDistance( animComp, joints, axis ) {
	let axisValues = [];
	
	for (let i in joints) {
		let lclTransforms = animComp._skeletonPose._localTransforms[joints[i]._index];
		let localTrans = lclTransforms.translation;
		axisValues.push(localTrans[axis]);
	}
	
	axisValues.sort();
	
	return Math.abs(axisValues[axisValues.length-1] - axisValues[0]);
}

/**
  * Finds an AnimationLayer in an AnimationComponent asset given its name
  * @param {AnimationComponent} [animComp] asset to search
  * @param {string} [layerName] name of layer
  * @returns {AnimationLayer} 
  */
function findLayerByName( animComp, layerName )
{
	for (let i in animComp.layers) {
		if (animComp.layers[i]._name == layerName) {
			return animComp.layers[i];
		}
	}
	
	return null;
}

/**
  * Finds animations in a layer and categorizes them by a name tag
  * @param {Object} [animObject] object to store animations in. Keys are the name tags
  * @param {AnimationLayer} [layer] layer to search for animations in
  */
function getBlinkAnims (animObject, layer) {
	let blinkAnims = layer.getStates();

	for (let i in blinkAnims) {
		let animState = layer.getStateById(blinkAnims[i]);

		for (let animType in animObject) {
			if (animState._name.search(animType) != -1) {
				animObject[animType].push(animState);
			}
		}
	}
}

/**
  * Play a random blink animation based on its speed type
  * @param {string} [blinkType] speed type of blink to play - slow, med, fast
  */
function blink (blinkType, ctx) {
	let currentDistance = getCurrentDistance( ctx.entity.animationComponent, ctx.eyelidJoints, 'y' );
	let blinkWeight = currentDistance / ctx.eyelidDistance;
	if (blinkWeight > 1.0) {
		blinkWeight = 1.0;
	}
	ctx.entityData.blinkLayer.setBlendWeight(blinkWeight);
	
	ctx.entityData.isBlinking = true;
	// Find a random animation in the list of blink animations of this type
	let blinkAnimIndex = getRandomInt(0, ctx.entityData.blinkAnims[blinkType].length);
	let blinkAnim = ctx.entityData.blinkAnims[blinkType][blinkAnimIndex];
	ctx.entityData.blinkLayer.setCurrentStateById(blinkAnim.id, true, ctx.world.time, endBlink);

	// Reset blink timer after the animation finishes
	function endBlink() {
		ResetTimer(ctx);
		ctx.entityData.isBlinking = false;
	}
}

/**
  * Reset the blink timer with a random number around the average blink spacing
  */
function ResetTimer(ctx) {
    ctx.entityData.blinkTimer = getRandomFloat(ctx.entityData.BlinkSpacing / 4, ctx.entityData.BlinkSpacing * 2);
}

/**
  * Get a random float number between a min (inclusive) and max (exclusive) value
  * @param {number} [min] minimum value
  * @param {number} [max] maximum value
  * @returns {float} 
  */
function getRandomFloat(min, max) {
  return Math.random() * (max - min) + min;
}

/**
  * Get a random integer number between a min (inclusive) and max (exclusive) value
  * @param {number} [min] minimum value
  * @param {number} [max] maximum value
  * @returns {integer} 
  */
function getRandomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min)) + min;
}

/**
  * Choose a random integer in a range of weighted indices
  * @param {Array<number>} [weights] list of weight values
  * @returns {integer} 
  */
function randomWeightedIndex(weights) 
{
    let index = 0; 
    let total = 0;
    let weightTotal = 0;

    for (let i in weights) 
    {
        weightTotal += weights[i];
    }

    let randVal = getRandomFloat(0, weightTotal);

    for (index in weights) 
    {
        total += weights[index];
        if (total > randVal) 
        {
        	break;
        }         
    }

    return index;
}

/**
  * Choose a new blink type 
  * @returns {string} 
  */
function getNewBlinkType() {
	// Get a random type index, weighting medium the heaviest
	let weights = [32, 55, 10];
	let blinkIndex = randomWeightedIndex(weights);

	for (let blinkType in BlinkType) {
		if (BlinkType[blinkType] == blinkIndex) {
			return blinkType;
		}
	}
}
	
var fixedUpdate = function (args, ctx) {
	// Called on every physics update, after setup().
};
	
var update = function (args, ctx) {
	// Called on every render frame, after setup().
	 ctx.entityData.blinkTimer -= ctx.world.tpf;

    // Start a blink if the timer has run out or we're forcing a blink
    if (ctx.entityData.blinkTimer <= 0 && ctx.entityData.isBlinking == false) {
        let blinkType = getNewBlinkType();
        blink(blinkType, ctx);
    }
};
	
var lateUpdate = function (args, ctx) {
	// Called after all script "update" methods in the scene has been called.
};
	
var cleanup = function (args, ctx) {
	// Called when play mode stops.
};
	
var parameters = [
	{ type: 'float', key: 'BlinkSpacing', 'default': 3, description: 'Average time between blinks (in sec)' }
];