#!/bin/bash

set -e

LOG_FILE="../deployCC.log"
CHAINCODE_NAME="donationcontract"
CHAINCODE_VERSION="1.0"
CHAINCODE_PATH="../chaincode"
CHANNEL_NAME="donationchannel"
CHAINCODE_LANG="node"

echo "========== START : Chaincode Deployment ==========" | tee -a $LOG_FILE

# Package chaincode
echo "[INFO] Packaging chaincode..." | tee -a $LOG_FILE
peer lifecycle chaincode package ${CHAINCODE_NAME}.tar.gz --path ${CHAINCODE_PATH} --lang ${CHAINCODE_LANG} --label ${CHAINCODE_NAME}_${CHAINCODE_VERSION}

# Install chaincode (example for NGO peer)
echo "[INFO] Installing chaincode on peer0.ngo.donation.com..." | tee -a $LOG_FILE
CORE_PEER_LOCALMSPID="NGOMSP"
CORE_PEER_ADDRESS="peer0.ngo.donation.com:7051"
CORE_PEER_MSPCONFIGPATH="/etc/hyperledger/fabric/msp" # Update as needed

export CORE_PEER_LOCALMSPID CORE_PEER_ADDRESS CORE_PEER_MSPCONFIGPATH

peer lifecycle chaincode install ${CHAINCODE_NAME}.tar.gz

# Query installed chaincode package ID
PACKAGE_ID=$(peer lifecycle chaincode queryinstalled | grep "${CHAINCODE_NAME}_${CHAINCODE_VERSION}" | awk -F 'Package ID: |, Label:' '{print $2}')

echo "[INFO] Package ID: $PACKAGE_ID" | tee -a $LOG_FILE

# Approve chaincode for NGO org
echo "[INFO] Approving chaincode definition for NGO..." | tee -a $LOG_FILE
peer lifecycle chaincode approveformyorg \
    --channelID $CHANNEL_NAME \
    --name $CHAINCODE_NAME \
    --version $CHAINCODE_VERSION \
    --package-id $PACKAGE_ID \
    --sequence 1 \
    --init-required

# Commit chaincode definition
echo "[INFO] Committing chaincode definition to channel..." | tee -a $LOG_FILE
peer lifecycle chaincode commit \
    --channelID $CHANNEL_NAME \
    --name $CHAINCODE_NAME \
    --version $CHAINCODE_VERSION \
    --sequence 1 \
    --init-required \
    --peerAddresses peer0.ngo.donation.com:7051

echo "[INFO] Chaincode deployed successfully." | tee -a $LOG_FILE
echo "========== END : Chaincode Deployment ==========" | tee -a $LOG_FILE