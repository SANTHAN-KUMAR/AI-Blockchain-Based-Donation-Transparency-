/*
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

const { Contract } = require('fabric-contract-api');

/**
 * DonationContract - A comprehensive chaincode for managing charitable donation campaigns
 * Features:
 * - Campaign lifecycle management
 * - Milestone-based fund release
 * - Multi-role access control (NGO, Oracle, Donor)
 * - Donation tracking and transparency
 * - Audit trail for all transactions
 */
class DonationContract extends Contract {

    /**
     * Initialize the ledger with default data
     * @param {Context} ctx - Transaction context
     */
    async initLedger(ctx) {
        console.log('============= START : Initialize Ledger ===========');
        
        // Initialize with a sample campaign for testing
        const sampleCampaign = {
            docType: 'Campaign',
            campaignId: 'CAMP001',
            ngoWallet: 'NGO_WALLET_001',
            title: 'Clean Water Initiative',
            description: 'Providing clean water access to rural communities',
            goalAmount: 50000,
            currentAmount: 0,
            deadline: '2025-12-31T23:59:59.000Z',
            campaignStatus: 'Active',
            createdAt: new Date().toISOString(),
            createdBy: 'system',
            category: 'Water & Sanitation',
            milestones: {
                'MILE001': {
                    milestoneId: 'MILE001',
                    title: 'Water Pump Installation',
                    description: 'Install 5 water pumps in target villages',
                    budgetAmount: 25000,
                    targetDate: '2025-06-30T23:59:59.000Z',
                    isVerified: false,
                    fundsReleased: false,
                    verifiedAt: null,
                    verifiedBy: null
                },
                'MILE002': {
                    milestoneId: 'MILE002',
                    title: 'Water Quality Testing',
                    description: 'Conduct water quality tests and setup monitoring',
                    budgetAmount: 15000,
                    targetDate: '2025-09-30T23:59:59.000Z',
                    isVerified: false,
                    fundsReleased: false,
                    verifiedAt: null,
                    verifiedBy: null
                }
            },
            totalMilestones: 2,
            completedMilestones: 0,
            tags: ['water', 'rural', 'infrastructure']
        };

        await ctx.stub.putState(`CAMPAIGN_${sampleCampaign.campaignId}`, Buffer.from(JSON.stringify(sampleCampaign)));
        console.log('Sample campaign created successfully');
        console.log('============= END : Initialize Ledger ===========');
    }

    /**
     * Create a new donation campaign
     * @param {Context} ctx - Transaction context
     * @param {string} campaignId - Unique identifier for the campaign
     * @param {string} ngoWallet - NGO's wallet address
     * @param {string} title - Campaign title
     * @param {string} description - Campaign description
     * @param {number} goalAmount - Target amount to raise
     * @param {string} deadline - Campaign deadline (ISO string)
     * @param {string} category - Campaign category
     * @param {string} milestonesJSON - JSON string containing milestones data
     * @param {string} tags - Comma-separated tags
     * @returns {Object} Created campaign object
     */
    async createCampaign(ctx, campaignId, ngoWallet, title, description, goalAmount, deadline, category, milestonesJSON, tags) {
        console.log('============= START : Create Campaign ===========');

        // Input validation
        if (!campaignId || !ngoWallet || !title || !goalAmount || !deadline) {
            throw new Error('Missing required parameters for campaign creation');
        }

        // Check if campaign already exists
        const existingCampaignBytes = await ctx.stub.getState(`CAMPAIGN_${campaignId}`);
        if (existingCampaignBytes && existingCampaignBytes.length > 0) {
            throw new Error(`Campaign with ID ${campaignId} already exists`);
        }

        // Parse and validate milestones
        let milestones = {};
        let totalMilestones = 0;
        if (milestonesJSON) {
            try {
                const milestonesArray = JSON.parse(milestonesJSON);
                if (!Array.isArray(milestonesArray)) {
                    throw new Error('Milestones must be an array');
                }

                let totalBudget = 0;
                milestonesArray.forEach((milestone, index) => {
                    if (!milestone.milestoneId || !milestone.title || !milestone.budgetAmount) {
                        throw new Error(`Invalid milestone at index ${index}: missing required fields`);
                    }
                    
                    milestones[milestone.milestoneId] = {
                        milestoneId: milestone.milestoneId,
                        title: milestone.title,
                        description: milestone.description || '',
                        budgetAmount: parseInt(milestone.budgetAmount),
                        targetDate: milestone.targetDate || deadline,
                        isVerified: false,
                        fundsReleased: false,
                        verifiedAt: null,
                        verifiedBy: null
                    };
                    
                    totalBudget += parseInt(milestone.budgetAmount);
                    totalMilestones++;
                });

                // Validate total milestone budget doesn't exceed goal
                if (totalBudget > parseInt(goalAmount)) {
                    throw new Error('Total milestone budget exceeds campaign goal amount');
                }
            } catch (error) {
                throw new Error(`Error parsing milestones JSON: ${error.message}`);
            }
        }

        // Get creator identity
        const creator = ctx.clientIdentity.getID();

        // Create campaign object
        const campaign = {
            docType: 'Campaign',
            campaignId: campaignId,
            ngoWallet: ngoWallet,
            title: title,
            description: description,
            goalAmount: parseInt(goalAmount),
            currentAmount: 0,
            deadline: deadline,
            campaignStatus: 'Active',
            createdAt: new Date().toISOString(),
            createdBy: creator,
            category: category || 'General',
            milestones: milestones,
            totalMilestones: totalMilestones,
            completedMilestones: 0,
            tags: tags ? tags.split(',').map(tag => tag.trim()) : []
        };

        // Save to ledger
        await ctx.stub.putState(`CAMPAIGN_${campaignId}`, Buffer.from(JSON.stringify(campaign)));

        // Emit event
        ctx.stub.setEvent('CampaignCreated', Buffer.from(JSON.stringify({
            campaignId: campaignId,
            ngoWallet: ngoWallet,
            goalAmount: parseInt(goalAmount),
            createdBy: creator,
            timestamp: campaign.createdAt
        })));

        console.log(`Campaign ${campaignId} created successfully`);
        console.log('============= END : Create Campaign ===========');
        return campaign;
    }

    /**
     * Process a donation to a campaign
     * @param {Context} ctx - Transaction context
     * @param {string} campaignId - Campaign identifier
     * @param {number} donationAmount - Amount donated
     * @param {string} donorId - Donor identifier (optional)
     * @param {string} message - Optional donation message
     * @returns {Object} Updated campaign object
     */
    async donate(ctx, campaignId, donationAmount, donorId, message) {
        console.log('============= START : Process Donation ===========');

        // Input validation
        if (!campaignId || !donationAmount) {
            throw new Error('Campaign ID and donation amount are required');
        }

        const amount = parseInt(donationAmount);
        if (amount <= 0) {
            throw new Error('Donation amount must be positive');
        }

        // Get campaign from ledger
        const campaignBytes = await ctx.stub.getState(`CAMPAIGN_${campaignId}`);
        if (!campaignBytes || campaignBytes.length === 0) {
            throw new Error(`Campaign with ID ${campaignId} does not exist`);
        }

        const campaign = JSON.parse(campaignBytes.toString());

        // Check campaign status
        if (campaign.campaignStatus !== 'Active') {
            throw new Error(`Cannot donate to campaign with status: ${campaign.campaignStatus}`);
        }

        // Check deadline
        const now = new Date();
        const deadline = new Date(campaign.deadline);
        if (now > deadline) {
            throw new Error('Campaign deadline has passed');
        }

        // Update campaign
        campaign.currentAmount += amount;
        campaign.lastDonationAt = new Date().toISOString();

        // Check if goal reached
        if (campaign.currentAmount >= campaign.goalAmount) {
            campaign.campaignStatus = 'GoalReached';
        }

        // Save updated campaign
        await ctx.stub.putState(`CAMPAIGN_${campaignId}`, Buffer.from(JSON.stringify(campaign)));

        // Create donation record
        const donationId = `DONATION_${campaignId}_${ctx.stub.getTxID()}`;
        const donation = {
            docType: 'Donation',
            donationId: donationId,
            campaignId: campaignId,
            donorId: donorId || 'anonymous',
            amount: amount,
            message: message || '',
            timestamp: new Date().toISOString(),
            txId: ctx.stub.getTxID(),
            donorIdentity: ctx.clientIdentity.getID()
        };

        await ctx.stub.putState(donationId, Buffer.from(JSON.stringify(donation)));

        // Emit events
        ctx.stub.setEvent('DonationReceived', Buffer.from(JSON.stringify({
            campaignId: campaignId,
            donationAmount: amount,
            donorId: donorId,
            currentAmount: campaign.currentAmount,
            timestamp: donation.timestamp
        })));

        if (campaign.campaignStatus === 'GoalReached') {
            ctx.stub.setEvent('GoalReached', Buffer.from(JSON.stringify({
                campaignId: campaignId,
                goalAmount: campaign.goalAmount,
                currentAmount: campaign.currentAmount,
                timestamp: new Date().toISOString()
            })));
        }

        console.log(`Donation of ${amount} processed for campaign ${campaignId}`);
        console.log('============= END : Process Donation ===========');
        return campaign;
    }

    /**
     * Verify a milestone (Oracle function)
     * @param {Context} ctx - Transaction context
     * @param {string} campaignId - Campaign identifier
     * @param {string} milestoneId - Milestone identifier
     * @param {string} verificationNotes - Optional verification notes
     * @returns {Object} Updated campaign object
     */
    async setMilestoneVerified(ctx, campaignId, milestoneId, verificationNotes) {
        console.log('============= START : Verify Milestone ===========');

        // Access Control - Check if caller is authorized Oracle
        const clientId = ctx.clientIdentity.getID();
        const oracleId = "ORACLE_AUTHORIZED_ID"; // In production, this should be configurable
        
        // For demo purposes, allow any identity with "oracle" in the name
        if (!clientId.toLowerCase().includes('oracle') && clientId !== oracleId) {
            throw new Error(`Unauthorized: Only Oracle can verify milestones. Current identity: ${clientId}`);
        }

        // Get campaign
        const campaignBytes = await ctx.stub.getState(`CAMPAIGN_${campaignId}`);
        if (!campaignBytes || campaignBytes.length === 0) {
            throw new Error(`Campaign with ID ${campaignId} does not exist`);
        }

        const campaign = JSON.parse(campaignBytes.toString());

        // Check if milestone exists
        if (!campaign.milestones || !campaign.milestones[milestoneId]) {
            throw new Error(`Milestone ${milestoneId} not found in campaign ${campaignId}`);
        }

        // Check if already verified
        if (campaign.milestones[milestoneId].isVerified) {
            throw new Error(`Milestone ${milestoneId} is already verified`);
        }

        // Verify milestone
        campaign.milestones[milestoneId].isVerified = true;
        campaign.milestones[milestoneId].verifiedAt = new Date().toISOString();
        campaign.milestones[milestoneId].verifiedBy = clientId;
        campaign.milestones[milestoneId].verificationNotes = verificationNotes || '';

        // Save updated campaign
        await ctx.stub.putState(`CAMPAIGN_${campaignId}`, Buffer.from(JSON.stringify(campaign)));

        // Emit event
        ctx.stub.setEvent('MilestoneVerified', Buffer.from(JSON.stringify({
            campaignId: campaignId,
            milestoneId: milestoneId,
            verifiedBy: clientId,
            verifiedAt: campaign.milestones[milestoneId].verifiedAt,
            budgetAmount: campaign.milestones[milestoneId].budgetAmount
        })));

        console.log(`Milestone ${milestoneId} verified for campaign ${campaignId}`);
        console.log('============= END : Verify Milestone ===========');
        return campaign;
    }

    /**
     * Release funds for a verified milestone
     * @param {Context} ctx - Transaction context
     * @param {string} campaignId - Campaign identifier
     * @param {string} milestoneId - Milestone identifier
     * @returns {Object} Updated campaign object
     */
    async releaseMilestoneFunds(ctx, campaignId, milestoneId) {
        console.log('============= START : Release Milestone Funds ===========');

        // Get campaign
        const campaignBytes = await ctx.stub.getState(`CAMPAIGN_${campaignId}`);
        if (!campaignBytes || campaignBytes.length === 0) {
            throw new Error(`Campaign with ID ${campaignId} does not exist`);
        }

        const campaign = JSON.parse(campaignBytes.toString());

        // Check if milestone exists
        if (!campaign.milestones || !campaign.milestones[milestoneId]) {
            throw new Error(`Milestone ${milestoneId} not found in campaign ${campaignId}`);
        }

        const milestone = campaign.milestones[milestoneId];

        // Validation checks
        if (!milestone.isVerified) {
            throw new Error(`Milestone ${milestoneId} is not verified yet`);
        }

        if (milestone.fundsReleased) {
            throw new Error(`Funds for milestone ${milestoneId} have already been released`);
        }

        // Check if sufficient funds are available
        if (campaign.currentAmount < milestone.budgetAmount) {
            throw new Error(`Insufficient funds in campaign. Required: ${milestone.budgetAmount}, Available: ${campaign.currentAmount}`);
        }

        // Release funds
        milestone.fundsReleased = true;
        milestone.fundsReleasedAt = new Date().toISOString();
        milestone.releasedBy = ctx.clientIdentity.getID();

        // Update campaign counters
        campaign.completedMilestones += 1;

        // Check if all milestones are completed
        if (campaign.completedMilestones === campaign.totalMilestones) {
            campaign.campaignStatus = 'Completed';
        }

        // Save updated campaign
        await ctx.stub.putState(`CAMPAIGN_${campaignId}`, Buffer.from(JSON.stringify(campaign)));

        // Create fund release record
        const releaseId = `RELEASE_${campaignId}_${milestoneId}_${ctx.stub.getTxID()}`;
        const fundRelease = {
            docType: 'FundRelease',
            releaseId: releaseId,
            campaignId: campaignId,
            milestoneId: milestoneId,
            amount: milestone.budgetAmount,
            recipientWallet: campaign.ngoWallet,
            releasedAt: milestone.fundsReleasedAt,
            releasedBy: milestone.releasedBy,
            txId: ctx.stub.getTxID()
        };

        await ctx.stub.putState(releaseId, Buffer.from(JSON.stringify(fundRelease)));

        // Emit events
        ctx.stub.setEvent('FundsReleased', Buffer.from(JSON.stringify({
            campaignId: campaignId,
            milestoneId: milestoneId,
            amount: milestone.budgetAmount,
            recipientWallet: campaign.ngoWallet,
            releasedAt: milestone.fundsReleasedAt
        })));

        if (campaign.campaignStatus === 'Completed') {
            ctx.stub.setEvent('CampaignCompleted', Buffer.from(JSON.stringify({
                campaignId: campaignId,
                totalAmount: campaign.currentAmount,
                completedMilestones: campaign.completedMilestones,
                completedAt: new Date().toISOString()
            })));
        }

        console.log(`Funds released for milestone ${milestoneId} in campaign ${campaignId}`);
        console.log('============= END : Release Milestone Funds ===========');
        return campaign;
    }

    /**
     * Read a campaign from the ledger
     * @param {Context} ctx - Transaction context
     * @param {string} campaignId - Campaign identifier
     * @returns {Object} Campaign object
     */
    async readCampaign(ctx, campaignId) {
        const campaignBytes = await ctx.stub.getState(`CAMPAIGN_${campaignId}`);
        if (!campaignBytes || campaignBytes.length === 0) {
            throw new Error(`Campaign with ID ${campaignId} does not exist`);
        }
        return JSON.parse(campaignBytes.toString());
    }

    /**
     * Get all campaigns (with pagination support)
     * @param {Context} ctx - Transaction context
     * @param {string} startKey - Start key for pagination (optional)
     * @param {string} endKey - End key for pagination (optional)
     * @param {number} pageSize - Page size (optional, default 10)
     * @returns {Array} Array of campaign objects
     */
    async getAllCampaigns(ctx, startKey, endKey, pageSize) {
        const iterator = await ctx.stub.getStateByRange(
            startKey || 'CAMPAIGN_',
            endKey || 'CAMPAIGN_\uffff'
        );

        const campaigns = [];
        let count = 0;
        const limit = parseInt(pageSize) || 10;

        for await (const result of iterator) {
            if (count >= limit) break;
            
            const campaign = JSON.parse(result.value.toString());
            campaigns.push(campaign);
            count++;
        }

        return campaigns;
    }

    /**
     * Get campaigns by NGO wallet
     * @param {Context} ctx - Transaction context
     * @param {string} ngoWallet - NGO wallet address
     * @returns {Array} Array of campaign objects
     */
    async getCampaignsByNGO(ctx, ngoWallet) {
        const queryString = JSON.stringify({
            selector: {
                docType: 'Campaign',
                ngoWallet: ngoWallet
            }
        });

        const iterator = await ctx.stub.getQueryResult(queryString);
        const campaigns = [];

        for await (const result of iterator) {
            const campaign = JSON.parse(result.value.toString());
            campaigns.push(campaign);
        }

        return campaigns;
    }

    /**
     * Get donation history for a campaign
     * @param {Context} ctx - Transaction context
     * @param {string} campaignId - Campaign identifier
     * @returns {Array} Array of donation objects
     */
    async getDonationHistory(ctx, campaignId) {
        const queryString = JSON.stringify({
            selector: {
                docType: 'Donation',
                campaignId: campaignId
            }
        });

        const iterator = await ctx.stub.getQueryResult(queryString);
        const donations = [];

        for await (const result of iterator) {
            const donation = JSON.parse(result.value.toString());
            donations.push(donation);
        }

        return donations;
    }

    /**
     * Update campaign status (admin function)
     * @param {Context} ctx - Transaction context
     * @param {string} campaignId - Campaign identifier
     * @param {string} newStatus - New status (Active, Paused, Cancelled, Completed)
     * @param {string} reason - Reason for status change
     * @returns {Object} Updated campaign object
     */
    async updateCampaignStatus(ctx, campaignId, newStatus, reason) {
        console.log('============= START : Update Campaign Status ===========');

        const validStatuses = ['Active', 'Paused', 'Cancelled', 'Completed', 'GoalReached'];
        if (!validStatuses.includes(newStatus)) {
            throw new Error(`Invalid status: ${newStatus}. Valid statuses: ${validStatuses.join(', ')}`);
        }

        // Get campaign
        const campaignBytes = await ctx.stub.getState(`CAMPAIGN_${campaignId}`);
        if (!campaignBytes || campaignBytes.length === 0) {
            throw new Error(`Campaign with ID ${campaignId} does not exist`);
        }

        const campaign = JSON.parse(campaignBytes.toString());
        const oldStatus = campaign.campaignStatus;

        // Update status
        campaign.campaignStatus = newStatus;
        campaign.lastStatusUpdate = new Date().toISOString();
        campaign.statusUpdateReason = reason || '';
        campaign.statusUpdatedBy = ctx.clientIdentity.getID();

        // Save updated campaign
        await ctx.stub.putState(`CAMPAIGN_${campaignId}`, Buffer.from(JSON.stringify(campaign)));

        // Emit event
        ctx.stub.setEvent('CampaignStatusUpdated', Buffer.from(JSON.stringify({
            campaignId: campaignId,
            oldStatus: oldStatus,
            newStatus: newStatus,
            reason: reason,
            updatedBy: campaign.statusUpdatedBy,
            updatedAt: campaign.lastStatusUpdate
        })));

        console.log(`Campaign ${campaignId} status updated from ${oldStatus} to ${newStatus}`);
        console.log('============= END : Update Campaign Status ===========');
        return campaign;
    }

    /**
     * Get campaign analytics/summary
     * @param {Context} ctx - Transaction context
     * @param {string} campaignId - Campaign identifier
     * @returns {Object} Campaign analytics object
     */
    async getCampaignAnalytics(ctx, campaignId) {
        const campaign = await this.readCampaign(ctx, campaignId);
        const donations = await this.getDonationHistory(ctx, campaignId);

        // Calculate analytics
        const totalDonations = donations.length;
        const averageDonation = totalDonations > 0 ? campaign.currentAmount / totalDonations : 0;
        const progressPercentage = (campaign.currentAmount / campaign.goalAmount) * 100;
        
        // Milestone progress
        const verifiedMilestones = Object.values(campaign.milestones).filter(m => m.isVerified).length;
        const releasedMilestones = Object.values(campaign.milestones).filter(m => m.fundsReleased).length;

        return {
            campaignId: campaignId,
            title: campaign.title,
            goalAmount: campaign.goalAmount,
            currentAmount: campaign.currentAmount,
            progressPercentage: Math.round(progressPercentage * 100) / 100,
            totalDonations: totalDonations,
            averageDonation: Math.round(averageDonation * 100) / 100,
            status: campaign.campaignStatus,
            totalMilestones: campaign.totalMilestones,
            verifiedMilestones: verifiedMilestones,
            releasedMilestones: releasedMilestones,
            completedMilestones: campaign.completedMilestones,
            daysRemaining: Math.max(0, Math.ceil((new Date(campaign.deadline) - new Date()) / (1000 * 60 * 60 * 24))),
            createdAt: campaign.createdAt,
            lastDonationAt: campaign.lastDonationAt
        };
    }
}

module.exports = DonationContract;