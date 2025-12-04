// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract MentalHealthScreeningFHE is SepoliaConfig {
    struct EncryptedEntry {
        uint256 id;
        euint32 encryptedTextFeature;
        euint32 encryptedVoiceFeature;
        euint32 encryptedCategory;
        uint256 timestamp;
    }

    struct DecryptedEntry {
        string textFeature;
        string voiceFeature;
        string category;
        bool isRevealed;
        string riskLevel;
    }

    uint256 public entryCount;
    mapping(uint256 => EncryptedEntry) public encryptedEntries;
    mapping(uint256 => DecryptedEntry) public decryptedEntries;

    mapping(string => euint32) private encryptedCategoryCount;
    string[] private categoryList;

    mapping(uint256 => uint256) private requestToEntryId;

    event EntrySubmitted(uint256 indexed id, uint256 timestamp);
    event DecryptionRequested(uint256 indexed id);
    event EntryDecrypted(uint256 indexed id, string riskLevel);

    modifier onlyParticipant(uint256 entryId) {
        _; // placeholder for access control
    }

    function submitEncryptedEntry(
        euint32 encryptedTextFeature,
        euint32 encryptedVoiceFeature,
        euint32 encryptedCategory
    ) public {
        entryCount += 1;
        uint256 newId = entryCount;

        encryptedEntries[newId] = EncryptedEntry({
            id: newId,
            encryptedTextFeature: encryptedTextFeature,
            encryptedVoiceFeature: encryptedVoiceFeature,
            encryptedCategory: encryptedCategory,
            timestamp: block.timestamp
        });

        decryptedEntries[newId] = DecryptedEntry({
            textFeature: "",
            voiceFeature: "",
            category: "",
            isRevealed: false,
            riskLevel: ""
        });

        emit EntrySubmitted(newId, block.timestamp);
    }

    function requestEntryDecryption(uint256 entryId) public onlyParticipant(entryId) {
        EncryptedEntry storage entry = encryptedEntries[entryId];
        require(!decryptedEntries[entryId].isRevealed, "Already decrypted");

        bytes32 ;
        ciphertexts[0] = FHE.toBytes32(entry.encryptedTextFeature);
        ciphertexts[1] = FHE.toBytes32(entry.encryptedVoiceFeature);
        ciphertexts[2] = FHE.toBytes32(entry.encryptedCategory);

        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptEntry.selector);
        requestToEntryId[reqId] = entryId;

        emit DecryptionRequested(entryId);
    }

    function decryptEntry(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 entryId = requestToEntryId[requestId];
        require(entryId != 0, "Invalid request");

        EncryptedEntry storage eEntry = encryptedEntries[entryId];
        DecryptedEntry storage dEntry = decryptedEntries[entryId];
        require(!dEntry.isRevealed, "Already decrypted");

        FHE.checkSignatures(requestId, cleartexts, proof);

        string[] memory results = abi.decode(cleartexts, (string[]));

        dEntry.textFeature = results[0];
        dEntry.voiceFeature = results[1];
        dEntry.category = results[2];
        dEntry.isRevealed = true;

        dEntry.riskLevel = assessRisk(dEntry.textFeature, dEntry.voiceFeature);

        if (!FHE.isInitialized(encryptedCategoryCount[dEntry.category])) {
            encryptedCategoryCount[dEntry.category] = FHE.asEuint32(0);
            categoryList.push(dEntry.category);
        }

        encryptedCategoryCount[dEntry.category] = FHE.add(
            encryptedCategoryCount[dEntry.category],
            FHE.asEuint32(1)
        );

        emit EntryDecrypted(entryId, dEntry.riskLevel);
    }

    function getDecryptedEntry(uint256 entryId) public view returns (
        string memory textFeature,
        string memory voiceFeature,
        string memory category,
        bool isRevealed,
        string memory riskLevel
    ) {
        DecryptedEntry storage entry = decryptedEntries[entryId];
        return (entry.textFeature, entry.voiceFeature, entry.category, entry.isRevealed, entry.riskLevel);
    }

    function getEncryptedCategoryCount(string memory category) public view returns (euint32) {
        return encryptedCategoryCount[category];
    }

    function requestCategoryCountDecryption(string memory category) public {
        euint32 count = encryptedCategoryCount[category];
        require(FHE.isInitialized(count), "Category not found");

        bytes32 ;
        ciphertexts[0] = FHE.toBytes32(count);

        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptCategoryCount.selector);
        requestToEntryId[reqId] = bytes32ToUint(keccak256(abi.encodePacked(category)));
    }

    function decryptCategoryCount(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 categoryHash = requestToEntryId[requestId];
        string memory category = getCategoryFromHash(categoryHash);

        FHE.checkSignatures(requestId, cleartexts, proof);

        uint32 count = abi.decode(cleartexts, (uint32));
        // Optionally handle count
    }

    function assessRisk(string memory textFeature, string memory voiceFeature) private pure returns (string memory) {
        // Simplified risk logic placeholder
        if (bytes(textFeature).length + bytes(voiceFeature).length > 100) {
            return "High";
        } else {
            return "Low";
        }
    }

    function bytes32ToUint(bytes32 b) private pure returns (uint256) {
        return uint256(b);
    }

    function getCategoryFromHash(uint256 hash) private view returns (string memory) {
        for (uint i = 0; i < categoryList.length; i++) {
            if (bytes32ToUint(keccak256(abi.encodePacked(categoryList[i]))) == hash) {
                return categoryList[i];
            }
        }
        revert("Category not found");
    }
}
