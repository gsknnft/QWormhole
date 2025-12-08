/**
 * Negentropic Ledger - On-Disk Log for Field Metrics
 * 
 * Lightweight append-only log that tracks field metrics over time.
 * Can serve as foundation for L2 state root later.
 */

import { writeFile, readFile, appendFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

/**
 * Ledger entry structure
 */
export interface LedgerEntry {
  /** Entry ID (sequential) */
  id: number;
  
  /** Timestamp */
  timestamp: number;
  
  /** Device/peer ID */
  peerId: string;
  
  /** Field metrics snapshot */
  metrics: {
    entropy: number;
    coherence: number;
    negentropicIndex: number;
  };
  
  /** Hash of this entry */
  hash: string;
  
  /** Hash of previous entry (chain) */
  previousHash: string;
}

/**
 * Ledger statistics
 */
export interface LedgerStats {
  /** Total entries */
  totalEntries: number;
  
  /** First entry timestamp */
  firstTimestamp: number;
  
  /** Last entry timestamp */
  lastTimestamp: number;
  
  /** Average negentropic index */
  averageN: number;
  
  /** Chain integrity status */
  chainIntact: boolean;
}

/**
 * Negentropic Ledger
 * 
 * Maintains an append-only log of field metrics with hash chain integrity.
 */
export class NegentropicLedger {
  private logPath: string;
  private indexPath: string;
  private entries: LedgerEntry[] = [];
  private nextId = 0;
  
  constructor(private config: {
    dataDir?: string;
    maxMemoryEntries?: number;
  } = {}) {
    const dataDir = config.dataDir || './data/ledger';
    this.logPath = join(dataDir, 'negentropic.log');
    this.indexPath = join(dataDir, 'negentropic.index');
  }
  
  /**
   * Initialize ledger (create directories, load index)
   */
  async init(): Promise<void> {
    const dataDir = this.config.dataDir || './data/ledger';
    
    // Create directory if needed
    if (!existsSync(dataDir)) {
      await mkdir(dataDir, { recursive: true });
    }
    
    // Load existing index
    await this.loadIndex();
    
    // Load recent entries into memory
    await this.loadRecentEntries();
  }
  
  /**
   * Append entry to ledger
   */
  async append(peerId: string, metrics: {
    entropy: number;
    coherence: number;
    negentropicIndex: number;
  }): Promise<LedgerEntry> {
    const entry: LedgerEntry = {
      id: this.nextId++,
      timestamp: Date.now(),
      peerId,
      metrics,
      hash: '',
      previousHash: this.entries.length > 0 
        ? this.entries[this.entries.length - 1].hash 
        : '0'.repeat(64)
    };
    
    // Compute hash
    entry.hash = await this.computeHash(entry);
    
    // Add to memory
    this.entries.push(entry);
    
    // Trim memory if needed
    const maxMemory = this.config.maxMemoryEntries || 1000;
    if (this.entries.length > maxMemory) {
      this.entries.shift();
    }
    
    // Append to disk
    await this.appendToDisk(entry);
    
    // Update index
    await this.updateIndex();
    
    return entry;
  }
  
  /**
   * Get recent entries
   */
  getRecent(count: number = 100): LedgerEntry[] {
    return this.entries.slice(-count);
  }
  
  /**
   * Get entries for specific peer
   */
  getByPeer(peerId: string, count: number = 100): LedgerEntry[] {
    return this.entries
      .filter(e => e.peerId === peerId)
      .slice(-count);
  }
  
  /**
   * Get ledger statistics
   */
  async getStats(): Promise<LedgerStats> {
    if (this.entries.length === 0) {
      return {
        totalEntries: 0,
        firstTimestamp: 0,
        lastTimestamp: 0,
        averageN: 0,
        chainIntact: true
      };
    }
    
    const avgN = this.entries.reduce((sum, e) => 
      sum + e.metrics.negentropicIndex, 0
    ) / this.entries.length;
    
    // Verify chain integrity
    const chainIntact = await this.verifyChain();
    
    return {
      totalEntries: this.nextId,
      firstTimestamp: this.entries[0].timestamp,
      lastTimestamp: this.entries[this.entries.length - 1].timestamp,
      averageN: avgN,
      chainIntact
    };
  }
  
  /**
   * Verify chain integrity
   */
  async verifyChain(): Promise<boolean> {
    for (let i = 1; i < this.entries.length; i++) {
      const prev = this.entries[i - 1];
      const curr = this.entries[i];
      
      if (curr.previousHash !== prev.hash) {
        return false;
      }
      
      // Re-compute current hash to verify
      const expectedHash = await this.computeHash({
        ...curr,
        hash: '' // Clear hash before computing
      });
      
      if (curr.hash !== expectedHash) {
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Export ledger to JSON
   */
  async export(filepath: string): Promise<void> {
    const data = {
      entries: this.entries,
      stats: await this.getStats()
    };
    
    await writeFile(filepath, JSON.stringify(data, null, 2));
  }
  
  /**
   * Compute hash of entry
   */
  private async computeHash(entry: Omit<LedgerEntry, 'hash'> | LedgerEntry): Promise<string> {
    const { createHash } = await import('crypto');
    
    const data = JSON.stringify({
      id: entry.id,
      timestamp: entry.timestamp,
      peerId: entry.peerId,
      metrics: entry.metrics,
      previousHash: entry.previousHash
    });
    
    return createHash('sha256').update(data).digest('hex');
  }
  
  /**
   * Append entry to disk log
   */
  private async appendToDisk(entry: LedgerEntry): Promise<void> {
    const line = JSON.stringify(entry) + '\n';
    await appendFile(this.logPath, line, 'utf-8');
  }
  
  /**
   * Load index from disk
   */
  private async loadIndex(): Promise<void> {
    try {
      if (existsSync(this.indexPath)) {
        const data = await readFile(this.indexPath, 'utf-8');
        const index = JSON.parse(data);
        this.nextId = index.nextId || 0;
      }
    } catch (error) {
      // Index doesn't exist or corrupted, will rebuild
      this.nextId = 0;
    }
  }
  
  /**
   * Update index on disk
   */
  private async updateIndex(): Promise<void> {
    const index = {
      nextId: this.nextId,
      lastUpdate: Date.now()
    };
    
    await writeFile(this.indexPath, JSON.stringify(index, null, 2));
  }
  
  /**
   * Load recent entries from disk into memory
   */
  private async loadRecentEntries(): Promise<void> {
    try {
      if (!existsSync(this.logPath)) {
        return;
      }
      
      const data = await readFile(this.logPath, 'utf-8');
      const lines = data.trim().split('\n').filter(l => l.length > 0);
      
      const maxMemory = this.config.maxMemoryEntries || 1000;
      const startIndex = Math.max(0, lines.length - maxMemory);
      
      this.entries = lines
        .slice(startIndex)
        .map(line => JSON.parse(line) as LedgerEntry);
      
      if (this.entries.length > 0) {
        this.nextId = this.entries[this.entries.length - 1].id + 1;
      }
    } catch (error) {
      console.error('Failed to load ledger entries:', error);
      this.entries = [];
    }
  }
}
