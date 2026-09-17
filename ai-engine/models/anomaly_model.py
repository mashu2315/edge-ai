"""LSTM-based anomaly detector for edge system metrics."""
import torch
import torch.nn as nn

class AnomalyDetector(nn.Module):
    """
    LSTM-based model that takes a sequence of system metrics
    and outputs an anomaly probability + category.
    
    Input shape: (batch, seq_len=10, features=8)
    Features: [cpu, memory_pct, disk, netIn, netOut, temp, load1, load5]
    
    Output:
      - anomaly_prob: float (0-1)
      - category_logits: (batch, 5) for [performance, security, hardware, software, network]
    """
    
    def __init__(self, input_size=8, hidden_size=64, num_layers=2, dropout=0.2):
        super(AnomalyDetector, self).__init__()
        
        self.lstm = nn.LSTM(
            input_size=input_size, 
            hidden_size=hidden_size, 
            num_layers=num_layers, 
            batch_first=True, 
            dropout=dropout
        )
        
        self.fc = nn.Sequential(
            nn.Linear(hidden_size, 32),
            nn.ReLU()
        )
        
        self.anomaly_head = nn.Sequential(
            nn.Linear(32, 1),
            nn.Sigmoid()
        )
        
        self.category_head = nn.Linear(32, 5)
        
    def forward(self, x):
        # x shape: (batch, seq_len, features)
        out, (hn, cn) = self.lstm(x)
        
        # Take the output of the last time step
        last_out = out[:, -1, :]
        
        fc_out = self.fc(last_out)
        
        anomaly_prob = self.anomaly_head(fc_out)
        category_logits = self.category_head(fc_out)
        
        return anomaly_prob, category_logits

def create_dummy_model():
    """Create and return an untrained model."""
    model = AnomalyDetector()
    model.eval()
    return model
