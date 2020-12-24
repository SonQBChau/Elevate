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
 * This script interfaces with AWS.LexRuntime
 */

function setup(args, ctx) {
	const settings = {
		botAlias: args.botAlias,
		botName: args.botName
	}

	ctx.settings = validateLexSettings(settings);

	// If your region does not support Amazon Lex, you may need to configure the region like the following:
	// lex = new AWS.LexRuntime({region: 'us-east-1'});
	// See Amazon Lex's supported regions: https://aws.amazon.com/about-aws/global-infrastructure/regional-product-services/
	let lex = null;
	sumerian.SystemBus.addListener('aws.sdkReady', () => {
		lex = new AWS.LexRuntime();
	}, true);
	
	const lexParams = {
		botAlias: ctx.settings.botAlias,
		botName: ctx.settings.botName,
		contentType: 'audio/x-l16; rate=16000',
		userId: 'testId',
	}

	/**
	 * Sends request to Amazon Lex with audio or text input.
	 * Emits concierge.lexResponseEvent event if Amazon Lex comes back with a successful response.
	 * @param {Blob | string} [data] Mic recording (Blob) or string of text to send to Amazon Lex
	 */
	ctx.onQueryLex = (data) => {
		lexParams.inputStream = data;

		if (data instanceof Blob) {
			lexParams.contentType = 'audio/x-l16; rate=16000';
		} else {
			lexParams.contentType = 'text/plain; charset=utf-8';
		}

		lex.postContent(lexParams, (err, data) => {
			if (err) {
				throw new Error(`Error sending query to Amazon Lex: ${err.name}. ${err.message}`);
			} else {
				sumerian.SystemBus.emit("concierge.lexResponseEvent", data);
			}
		});
	}

	sumerian.SystemBus.addListener("concierge.lexQueryEvent", ctx.onQueryLex);
};

function cleanup(args, ctx) {
	sumerian.SystemBus.removeListener("concierge.lexQueryEvent", ctx.onQueryLex);
};

	/**
	 * Validates user input for Amazon Lex. 
	 * Uses $LATEST bot if the bot alias is not provided.
	 * @param {Object} [settings] Amazon Lex conversation bot settings
	 */
function validateLexSettings(settings) {
	if (settings.botAlias === '') {
		console.log("Using the latest bot.");
		settings.botAlias = "$LATEST";
	}

	if (settings.botName === '') {
		throw new Error("Please provide a Lex bot name.");
	}

	return settings;
}

var parameters = [
	{
		name: 'Bot alias',
		key: 'botAlias',
		type: 'string',
		default: '$LATEST',
		description: "Amazon Lex bot alias."
		
	},
	{
		name: "Bot Name",
		key: 'botName',
		type: 'string',
		default: 'SumerianConciergeConversation',
		description: "Amazon Lex bot name."
	}
];