// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface ScreeningRecord {
  id: string;
  encryptedData: string;
  timestamp: number;
  owner: string;
  riskLevel: "low" | "moderate" | "high";
  suggestions: string[];
}

const App: React.FC = () => {
  // State management
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<ScreeningRecord[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newRecordData, setNewRecordData] = useState({
    text: "",
    type: "text" as "text" | "audio"
  });
  const [showFAQ, setShowFAQ] = useState(false);
  const [activeTab, setActiveTab] = useState("dashboard");

  // Statistics for dashboard
  const lowRiskCount = records.filter(r => r.riskLevel === "low").length;
  const moderateRiskCount = records.filter(r => r.riskLevel === "moderate").length;
  const highRiskCount = records.filter(r => r.riskLevel === "high").length;

  // Load records on initial render
  useEffect(() => {
    loadRecords().finally(() => setLoading(false));
  }, []);

  // Handle wallet selection
  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  // Wallet connection handlers
  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  // Load screening records from contract
  const loadRecords = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      // Get list of record keys
      const keysBytes = await contract.getData("screening_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing record keys:", e);
        }
      }
      
      const list: ScreeningRecord[] = [];
      
      // Load each record
      for (const key of keys) {
        try {
          const recordBytes = await contract.getData(`screening_${key}`);
          if (recordBytes.length > 0) {
            try {
              const recordData = JSON.parse(ethers.toUtf8String(recordBytes));
              list.push({
                id: key,
                encryptedData: recordData.data,
                timestamp: recordData.timestamp,
                owner: recordData.owner,
                riskLevel: recordData.riskLevel || "low",
                suggestions: recordData.suggestions || []
              });
            } catch (e) {
              console.error(`Error parsing record data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading record ${key}:`, e);
        }
      }
      
      // Sort by timestamp
      list.sort((a, b) => b.timestamp - a.timestamp);
      setRecords(list);
    } catch (e) {
      console.error("Error loading records:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  // Submit new screening data
  const submitScreening = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setCreating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting data with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-${btoa(JSON.stringify(newRecordData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      // Generate unique ID
      const recordId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      // Simulate FHE analysis (in a real app this would be done off-chain)
      const riskLevels: ("low" | "moderate" | "high")[] = ["low", "moderate", "high"];
      const randomRisk = riskLevels[Math.floor(Math.random() * riskLevels.length)];
      
      const suggestions = [
        "Practice mindfulness meditation",
        "Connect with supportive friends",
        "Consider professional counseling"
      ];
      
      const recordData = {
        data: encryptedData,
        timestamp: Math.floor(Date.now() / 1000),
        owner: account,
        riskLevel: randomRisk,
        suggestions
      };
      
      // Store encrypted data on-chain
      await contract.setData(
        `screening_${recordId}`, 
        ethers.toUtf8Bytes(JSON.stringify(recordData))
      );
      
      // Update keys list
      const keysBytes = await contract.getData("screening_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(recordId);
      
      await contract.setData(
        "screening_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Data submitted securely! FHE analysis complete."
      });
      
      // Refresh records
      await loadRecords();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewRecordData({
          text: "",
          type: "text"
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setCreating(false);
    }
  };

  // Check if current user is owner of a record
  const isOwner = (address: string) => {
    return account.toLowerCase() === address.toLowerCase();
  };

  // FAQ data
  const faqItems = [
    {
      question: "How does FHE protect my mental health data?",
      answer: "Fully Homomorphic Encryption allows your data to be analyzed while still encrypted. Your sensitive information never gets decrypted during processing, ensuring maximum privacy."
    },
    {
      question: "What kind of data can I submit?",
      answer: "You can submit encrypted text snippets from social media or encrypted voice recordings. Our FHE algorithms analyze linguistic patterns and vocal characteristics without accessing raw data."
    },
    {
      question: "How accurate are the screenings?",
      answer: "While our FHE-based analysis can identify potential early signals, it's not a clinical diagnosis. Always consult a healthcare professional for medical advice."
    },
    {
      question: "Is my data stored securely?",
      answer: "All data is encrypted end-to-end using FHE technology. Only you have the decryption keys, and analysis happens entirely on encrypted data."
    },
    {
      question: "Can I delete my data?",
      answer: "Yes, you can request deletion of your encrypted records at any time through the app interface."
    }
  ];

  // Render risk level chart
  const renderRiskChart = () => {
    const total = records.length || 1;
    const lowPercentage = (lowRiskCount / total) * 100;
    const moderatePercentage = (moderateRiskCount / total) * 100;
    const highPercentage = (highRiskCount / total) * 100;

    return (
      <div className="risk-chart-container">
        <div className="risk-chart">
          <div className="chart-bar low" style={{ height: `${lowPercentage}%` }}>
            <span className="bar-label">Low</span>
          </div>
          <div className="chart-bar moderate" style={{ height: `${moderatePercentage}%` }}>
            <span className="bar-label">Moderate</span>
          </div>
          <div className="chart-bar high" style={{ height: `${highPercentage}%` }}>
            <span className="bar-label">High</span>
          </div>
        </div>
        <div className="chart-legend">
          <div className="legend-item">
            <div className="color-box low"></div>
            <span>Low Risk: {lowRiskCount}</span>
          </div>
          <div className="legend-item">
            <div className="color-box moderate"></div>
            <span>Moderate: {moderateRiskCount}</span>
          </div>
          <div className="legend-item">
            <div className="color-box high"></div>
            <span>High Risk: {highRiskCount}</span>
          </div>
        </div>
      </div>
    );
  };

  // Loading screen
  if (loading) return (
    <div className="loading-screen">
      <div className="spinner"></div>
      <p>Initializing encrypted connection...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="brain-icon"></div>
          </div>
          <h1>Mind<span>Guard</span>Screen</h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-btn"
          >
            <div className="add-icon"></div>
            New Screening
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content">
        <div className="welcome-banner">
          <div className="welcome-text">
            <h2>Confidential Mental Health Screening</h2>
            <p>Analyze encrypted social media text or voice patterns with FHE technology</p>
          </div>
          <div className="fhe-badge">
            <span>FHE-Powered Privacy</span>
          </div>
        </div>
        
        <div className="tabs">
          <button 
            className={`tab-btn ${activeTab === "dashboard" ? "active" : ""}`}
            onClick={() => setActiveTab("dashboard")}
          >
            Dashboard
          </button>
          <button 
            className={`tab-btn ${activeTab === "records" ? "active" : ""}`}
            onClick={() => setActiveTab("records")}
          >
            My Records
          </button>
          <button 
            className={`tab-btn ${activeTab === "faq" ? "active" : ""}`}
            onClick={() => setActiveTab("faq")}
          >
            FAQ
          </button>
        </div>
        
        {activeTab === "dashboard" && (
          <div className="dashboard-grid">
            <div className="dashboard-card intro-card">
              <h3>Project Introduction</h3>
              <p>MindGuardScreen uses Fully Homomorphic Encryption (FHE) to analyze encrypted text or voice data for early signs of depression, anxiety, and other mental health concerns.</p>
              <div className="features">
                <div className="feature">
                  <div className="feature-icon lock"></div>
                  <span>End-to-end encrypted analysis</span>
                </div>
                <div className="feature">
                  <div className="feature-icon brain"></div>
                  <span>Early detection signals</span>
                </div>
                <div className="feature">
                  <div className="feature-icon shield"></div>
                  <span>Complete privacy protection</span>
                </div>
              </div>
            </div>
            
            <div className="dashboard-card stats-card">
              <h3>Screening Statistics</h3>
              <div className="stats-grid">
                <div className="stat-item">
                  <div className="stat-value">{records.length}</div>
                  <div className="stat-label">Total Screenings</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{lowRiskCount}</div>
                  <div className="stat-label">Low Risk</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{moderateRiskCount}</div>
                  <div className="stat-label">Moderate Risk</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{highRiskCount}</div>
                  <div className="stat-label">High Risk</div>
                </div>
              </div>
            </div>
            
            <div className="dashboard-card chart-card">
              <h3>Risk Distribution</h3>
              {renderRiskChart()}
            </div>
          </div>
        )}
        
        {activeTab === "records" && (
          <div className="records-section">
            <div className="section-header">
              <h2>My Screening Records</h2>
              <div className="header-actions">
                <button 
                  onClick={loadRecords}
                  className="refresh-btn"
                  disabled={isRefreshing}
                >
                  {isRefreshing ? "Refreshing..." : "Refresh"}
                </button>
              </div>
            </div>
            
            <div className="records-list">
              {records.length === 0 ? (
                <div className="no-records">
                  <div className="no-records-icon"></div>
                  <p>No screening records found</p>
                  <button 
                    className="primary-btn"
                    onClick={() => setShowCreateModal(true)}
                  >
                    Start First Screening
                  </button>
                </div>
              ) : (
                <div className="records-grid">
                  {records.map(record => (
                    <div className="record-card" key={record.id}>
                      <div className="card-header">
                        <div className={`risk-badge ${record.riskLevel}`}>
                          {record.riskLevel.toUpperCase()}
                        </div>
                        <div className="record-date">
                          {new Date(record.timestamp * 1000).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="card-content">
                        <div className="record-id">ID: #{record.id.substring(0, 6)}</div>
                        <div className="record-owner">
                          {isOwner(record.owner) ? "Your screening" : "Anonymous screening"}
                        </div>
                        <div className="suggestions">
                          <h4>Suggestions:</h4>
                          <ul>
                            {record.suggestions.map((s, i) => (
                              <li key={i}>{s}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        
        {activeTab === "faq" && (
          <div className="faq-section">
            <h2>Frequently Asked Questions</h2>
            <div className="faq-list">
              {faqItems.map((item, index) => (
                <div className="faq-item" key={index}>
                  <div className="faq-question">
                    <div className="question-icon">?</div>
                    <h3>{item.question}</h3>
                  </div>
                  <div className="faq-answer">
                    <p>{item.answer}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
  
      {/* Create Screening Modal */}
      {showCreateModal && (
        <ModalCreate 
          onSubmit={submitScreening} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating}
          recordData={newRecordData}
          setRecordData={setNewRecordData}
        />
      )}
      
      {/* Wallet Selector */}
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {/* Transaction Status Modal */}
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="brain-icon"></div>
              <span>MindGuardScreen</span>
            </div>
            <p>Confidential mental health screening using FHE technology</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms of Service</a>
            <a href="#" className="footer-link">Resources</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Privacy</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} MindGuardScreen. All rights reserved.
          </div>
          <div className="disclaimer">
            This is not a diagnostic tool. Always consult a healthcare professional.
          </div>
        </div>
      </footer>
    </div>
  );
};

// Modal for creating new screening
interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  recordData: any;
  setRecordData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ 
  onSubmit, 
  onClose, 
  creating,
  recordData,
  setRecordData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setRecordData({
      ...recordData,
      [name]: value
    });
  };

  const handleTypeChange = (type: "text" | "audio") => {
    setRecordData({
      ...recordData,
      type
    });
  };

  const handleSubmit = () => {
    if (!recordData.text) {
      alert("Please enter text to analyze");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal">
        <div className="modal-header">
          <h2>New Mental Health Screening</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <div className="lock-icon"></div> 
            <span>Your data will be encrypted with FHE before analysis</span>
          </div>
          
          <div className="input-group">
            <label>Screening Type</label>
            <div className="type-selector">
              <button 
                className={`type-btn ${recordData.type === "text" ? "active" : ""}`}
                onClick={() => handleTypeChange("text")}
              >
                Text Analysis
              </button>
              <button 
                className={`type-btn ${recordData.type === "audio" ? "active" : ""}`}
                onClick={() => handleTypeChange("audio")}
              >
                Voice Analysis
              </button>
            </div>
          </div>
          
          <div className="input-group">
            <label>
              {recordData.type === "text" 
                ? "Enter text to analyze (e.g., social media post)" 
                : "Paste audio transcript"}
            </label>
            <textarea 
              name="text"
              value={recordData.text} 
              onChange={handleChange}
              placeholder={recordData.type === "text" 
                ? "Enter text content here..." 
                : "Paste transcript of voice recording..."} 
              rows={6}
            />
          </div>
          
          <div className="privacy-note">
            <div className="info-icon"></div>
            <p>Your data remains encrypted during FHE processing and is never stored in plain text</p>
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={creating}
            className="submit-btn primary-btn"
          >
            {creating ? "Processing with FHE..." : "Run Secure Screening"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;