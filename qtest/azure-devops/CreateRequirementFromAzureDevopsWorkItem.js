const PulseSdk = require("@qasymphony/pulse-sdk");
const request = require("request");
const xml2js = require("xml2js");

// DO NOT EDIT exported "handler" function is the entrypoint
exports.handler = async function ({ event, constants, triggers }, context, callback) {
    function buildRequirementDescription(eventData) {
        return `Url: ${eventData.resource._links.html.href}
Type: ${eventData.resource.revision.fields["System.WorkItemType"]}
Area: ${eventData.resource.revision.fields["System.AreaPath"]}
Iteration: ${eventData.resource.revision.fields["System.IterationPath"]}
State: ${eventData.resource.revision.fields["System.State"]}
Reason: ${eventData.resource.revision.fields["System.Reason"]}
Description: ${eventData.resource.revision.fields["System.Description"]}`;
    }

    function buildRequirementName(namePrefix, eventData) {
        return `${namePrefix}${eventData.resource.revision.fields["System.Title"]}`;
    }

    const standardHeaders = {
        "Content-Type": "application/json",
        Authorization: `bearer ${constants.QTEST_TOKEN}`,
    };
    const eventType = {
        CREATED: "workitem.created",
        UPDATED: "workitem.updated",
    };

    const workItemId = event.resource.workItemId;
    const namePrefix = getNamePrefix(workItemId);

    let requirementToUpdate = undefined;
    switch (event.eventType) {
        case eventType.CREATED:
            console.log(`[Info] Create workitem event received for 'WI${workItemId}'`);
            break;
        case eventType.UPDATED:
            console.log(`[Info] Update workitem event received for 'WI${workItemId}'`);
            const getReqResult = await getRequirementByWorkItemId(workItemId);
            if (getReqResult.failed) {
                return;
            }
            if (getReqResult.requirement === undefined && !constants.AllowCreationOnUpdate) {
                console.log("[Info] Creation of Requirement on update event not enabled. Exiting.");
                return;
            }
            requirementToUpdate = getReqResult.requirement;
            break;
        default:
            console.log(`[Error] Unknown workitem event type '${event.eventType}' for 'WI${workitemId}'`);
            return;
    }

    const requirementDescription = buildRequirementDescription(event);
    const requirementName = buildRequirementName(namePrefix, event);

    if (requirementToUpdate) {
        await updateRequirement(requirementToUpdate, requirementName, requirementDescription);
    }

    function getNamePrefix(workItemId) {
        return `WI${workItemId}:`;
    }

    async function getRequirementByWorkItemId(workItemId) {
        const prefix = getNamePrefix(workItemId);
        const url = "https://" + constants.ManagerURL + "/api/v3/projects/" + constants.ProjectID + "/search";
        const requestBody = {
            object_type: "requirements",
            fields: ["*"],
            query: "Name ~ '" + prefix + "'",
        };

        console.log(`[Info] Get existing requirement for 'WI${workItemId}'`);
        let failed = false;
        let requirement = undefined;

        try {
            const response = await post(url, requestBody);
            console.log(response);

            if (!response || response.total === 0) {
                console.log("[Info] Requirement not found by work item id.");
            } else {
                if (response.total === 1) {
                    requirement = response.items[0];
                } else {
                    failed = true;
                    console.log("[Warn] Multiple Requirements found by work item id.");
                }
            }
        } catch (error) {
            console.log("[Error] Failed to get requirement by work item id.", error);
            failed = true;
        }

        return { failed: failed, requirement: requirement };
    }

    async function updateRequirement(requirementToUpdate, name, description) {
        const requirementId = requirementToUpdate.id;
        const url = `https://${constants.ManagerURL}/api/v3/projects/${constants.ProjectID}/requirements/${requirementId}`;
        const requestBody = {
            name: name,
            properties: [
                {
                    field_id: 10530218, //description field id
                    field_value: description,
                },
            ],
        };

        console.log(`[Info] Updating requirement '${requirementId}'`);

        try {
            await put(url, requestBody);
            console.log(`[Info] Requirement '${requirementId}' updated.`);
        } catch (error) {
            console.log(`[Error] Failed to update requirement '${requirementId}'.`, error);
        }
    }

    function post(url, requestBody) {
        return doPostPut(url, "POST", requestBody);
    }

    function put(url, requestBody) {
        return doPostPut(url, "PUT", requestBody);
    }

    async function doPostPut(url, method, requestBody) {
        const opts = {
            url: url,
            json: true,
            headers: standardHeaders,
            body: requestBody,
            method: method,
        };

        return new Promise((resolve, reject) => {
            request(opts, function (error, response, body) {
                if (error) reject(error);
                if (response.statusCode < 200 || response.statusCode >= 300) reject(`HTTP ${response.statusCode}`);

                resolve(body);
            });
        });
    }
};
