const PulseSdk = require("@qasymphony/pulse-sdk");
const request = require("request");
const xml2js = require("xml2js");

// DO NOT EDIT exported "handler" function is the entrypoint
exports.handler = async function ({ event, constants, triggers }, context, callback) {
    function buildDefectDescription(eventData) {
        const fields = getFields(eventData);
        return `<a href="${eventData.resource._links.html.href}" target="_blank">Open in Azure DevOps</a><br>
<b>Type:</b> ${fields["System.WorkItemType"]}<br>
<b>Area:</b> ${fields["System.AreaPath"]}<br>
<b>Iteration:</b> ${fields["System.IterationPath"]}<br>
<b>State:</b> ${fields["System.State"]}<br>
<b>Reason:</b> ${fields["System.Reason"]}<br>
<b>Repro steps:</b> ${fields["Microsoft.VSTS.TCM.ReproSteps"] || ""}
<b>System info:</b> ${fields["Microsoft.VSTS.TCM.SystemInfo"] || ""}
<b>Acceptance criteria:</b> ${fields["Microsoft.VSTS.Common.AcceptanceCriteria"] || ""}`;
    }

    function buildDefectSummary(namePrefix, eventData) {
        const fields = getFields(eventData);
        return `${namePrefix}${fields["System.Title"]}`;
    }

    function getFields(eventData) {
        // In case of update the fields can be taken from the revision, in case of create from the resource directly
        return eventData.resource.revision ? eventData.resource.revision.fields : eventData.resource.fields;
    }

    const standardHeaders = {
        "Content-Type": "application/json",
        Authorization: `bearer ${constants.QTEST_TOKEN}`,
    };
    const eventType = {
        CREATED: "workitem.created",
        UPDATED: "workitem.updated",
        DELETED: "workitem.deleted",
    };

    let workItemId = undefined;
    let defectToUpdate = undefined;
    switch (event.eventType) {
        case eventType.CREATED: {
            console.log(`[Info] Create workitem event received for 'WI${workItemId}'`);
            console.log(
                `[Info] New defects are not synched from Azure DevOps. The current workflow expects the defect to be created in qTest first. Exiting.`
            );
            return;
        }
        case eventType.UPDATED: {
            workItemId = event.resource.workItemId;
            console.log(`[Info] Update workitem event received for 'WI${workItemId}'`);
            const getDefectResult = await getDefectByWorkItemId(workItemId);
            if (getDefectResult.failed) {
                return;
            }
            if (getDefectResult.defect === undefined) {
                console.log("[Info] Corresponding defect not found. Exiting.");
                return;
            }
            defectToUpdate = getDefectResult.defect;
            break;
        }
        case eventType.DELETED: {
            console.log(`[Info] Delete workitem event received for 'WI${workItemId}'`);
            console.log(
                `[Info] Defects are not deleted in qTest automatically when deleting in Azure DevOps. Exiting.`
            );
            return;
        }
        default:
            console.log(`[Error] Unknown workitem event type '${event.eventType}' for 'WI${workitemId}'`);
            return;
    }

    // Prepare data to create/update requirement
    const namePrefix = getNamePrefix(workItemId);
    const defectDescription = buildDefectDescription(event);
    const defectSummary = buildDefectSummary(namePrefix, event);

    if (defectToUpdate) {
        await updateDefect(defectToUpdate, defectSummary, defectDescription);
    }

    function getNamePrefix(workItemId) {
        return `WI${workItemId}: `;
    }

    async function getDefectByWorkItemId(workItemId) {
        const prefix = getNamePrefix(workItemId);
        const url = "https://" + constants.ManagerURL + "/api/v3/projects/" + constants.ProjectID + "/search";
        const requestBody = {
            object_type: "defects",
            fields: ["*"],
            query: "Summary ~ '" + prefix + "'",
        };

        console.log(`[Info] Get existing defect for 'WI${workItemId}'`);
        let failed = false;
        let defect = undefined;

        try {
            const response = await post(url, requestBody);
            console.log(response);

            if (!response || response.total === 0) {
                console.log("[Info] Defect not found by work item id.");
            } else {
                if (response.total === 1) {
                    defect = response.items[0];
                } else {
                    failed = true;
                    console.log("[Warn] Multiple Defects found by work item id.");
                }
            }
        } catch (error) {
            console.log("[Error] Failed to get defect by work item id.", error);
            failed = true;
        }

        return { failed: failed, defect: defect };
    }

    async function updateDefect(defectToUpdate, summary, description) {
        const defectId = defectToUpdate.id;
        const url = `https://${constants.ManagerURL}/api/v3/projects/${constants.ProjectID}/defects/${defectId}`;
        const requestBody = {
            properties: [
                {
                    field_id: constants.DefectSummaryFieldID,
                    field_value: summary,
                },
                {
                    field_id: constants.DefectDescriptionFieldID,
                    field_value: description,
                },
            ],
        };

        console.log(`[Info] Updating defect '${defectId}'.`);

        try {
            await put(url, requestBody);
            console.log(`[Info] Defect '${defectId}' updated.`);
        } catch (error) {
            console.log(`[Error] Failed to update defect '${defectId}'.`, error);
        }
    }

    function post(url, requestBody) {
        return doqTestRequest(url, "POST", requestBody);
    }

    function put(url, requestBody) {
        return doqTestRequest(url, "PUT", requestBody);
    }

    async function doqTestRequest(url, method, requestBody) {
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
