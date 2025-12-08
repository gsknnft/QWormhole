/**
 * Negentropic Scheduler - Entropy-Aware Task Prioritization
 * 
 * Implements optimistic concurrency control where task execution priority
 * is weighted by negentropic index. Tasks with higher field coherence
 * are prioritized, creating a self-organizing execution model.
 */

/**
 * Schedulable job with field metrics
 */
export interface NegentropicJob<T = any> {
  /** Job identifier */
  id: string;
  
  /** Job execution function */
  execute: () => Promise<T>;
  
  /** Negentropic index for this job */
  negentropicIndex: number;
  
  /** Entropy measure */
  entropy: number;
  
  /** Coherence measure */
  coherence: number;
  
  /** Job priority (optional, defaults to negentropicIndex) */
  priority?: number;
  
  /** Job metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Job execution result
 */
export interface JobResult<T = any> {
  /** Job ID */
  jobId: string;
  
  /** Execution status */
  status: 'fulfilled' | 'rejected';
  
  /** Result value (if fulfilled) */
  value?: T;
  
  /** Error (if rejected) */
  error?: Error;
  
  /** Field metrics */
  negentropicIndex: number;
  entropy: number;
  coherence: number;
  
  /** Execution time in milliseconds */
  executionTime: number;
  
  /** Timestamp */
  timestamp: number;
}

/**
 * Scheduler decision log entry
 */
export interface SchedulerDecision {
  /** Timestamp */
  timestamp: number;
  
  /** Number of jobs evaluated */
  jobCount: number;
  
  /** Winner job ID */
  winnerId: string;
  
  /** Winner's negentropic index */
  winnerN: number;
  
  /** Winner's entropy */
  entropy: number;
  
  /** Winner's coherence */
  coherence: number;
  
  /** Total execution time */
  totalTime: number;
}

/**
 * Negentropic Scheduler
 * 
 * Executes jobs with priority based on negentropic index.
 * Implements entropy-aware optimistic concurrency.
 */
export class NegentropicScheduler {
  private decisionLog: SchedulerDecision[] = [];
  private maxLogSize = 100;
  
  constructor(private config?: {
    maxLogSize?: number;
    concurrentJobs?: number;
  }) {
    this.maxLogSize = config?.maxLogSize ?? 100;
  }
  
  /**
   * Execute jobs with negentropic prioritization
   * 
   * Jobs are executed concurrently, then ranked by negentropic index.
   * The highest-ranked result is returned as the "winner".
   */
  async run<T>(jobs: NegentropicJob<T>[]): Promise<JobResult<T>> {
    if (jobs.length === 0) {
      throw new Error('No jobs to execute');
    }
    
    const startTime = Date.now();
    
    // Execute all jobs concurrently (optimistic concurrency)
    const executions = jobs.map(async (job): Promise<JobResult<T>> => {
      const jobStart = Date.now();
      
      try {
        const value = await job.execute();
        
        return {
          jobId: job.id,
          status: 'fulfilled',
          value,
          negentropicIndex: job.negentropicIndex,
          entropy: job.entropy,
          coherence: job.coherence,
          executionTime: Date.now() - jobStart,
          timestamp: Date.now()
        };
      } catch (error) {
        return {
          jobId: job.id,
          status: 'rejected',
          error: error as Error,
          negentropicIndex: job.negentropicIndex,
          entropy: job.entropy,
          coherence: job.coherence,
          executionTime: Date.now() - jobStart,
          timestamp: Date.now()
        };
      }
    });
    
    // Wait for all jobs to complete
    const results = await Promise.allSettled(executions);
    
    // Extract fulfilled results
    const fulfilled = results
      .filter((r): r is PromiseSettledResult<JobResult<T>> & { status: 'fulfilled' } => 
        r.status === 'fulfilled'
      )
      .map((r) => r.value)
      .filter((r) => r.status === 'fulfilled');
    
    if (fulfilled.length === 0) {
      throw new Error('All jobs failed');
    }
    
    // Rank by negentropic index (higher is better)
    const ranked = fulfilled.sort((a, b) => b.negentropicIndex - a.negentropicIndex);
    
    // Winner is highest-ranked
    const winner = ranked[0];
    
    // Log decision
    this.logDecision({
      timestamp: Date.now(),
      jobCount: jobs.length,
      winnerId: winner.jobId,
      winnerN: winner.negentropicIndex,
      entropy: winner.entropy,
      coherence: winner.coherence,
      totalTime: Date.now() - startTime
    });
    
    return winner;
  }
  
  /**
   * Execute jobs with sequential fallback
   * 
   * Unlike run(), this executes jobs one at a time based on priority.
   * Useful when resources are constrained.
   */
  async runSequential<T>(jobs: NegentropicJob<T>[]): Promise<JobResult<T>> {
    if (jobs.length === 0) {
      throw new Error('No jobs to execute');
    }
    
    // Sort by priority (negentropic index)
    const sorted = [...jobs].sort((a, b) => {
      const priorityA = a.priority ?? a.negentropicIndex;
      const priorityB = b.priority ?? b.negentropicIndex;
      return priorityB - priorityA;
    });
    
    // Execute highest priority job
    const job = sorted[0];
    const startTime = Date.now();
    
    try {
      const value = await job.execute();
      
      const result: JobResult<T> = {
        jobId: job.id,
        status: 'fulfilled',
        value,
        negentropicIndex: job.negentropicIndex,
        entropy: job.entropy,
        coherence: job.coherence,
        executionTime: Date.now() - startTime,
        timestamp: Date.now()
      };
      
      this.logDecision({
        timestamp: Date.now(),
        jobCount: jobs.length,
        winnerId: job.id,
        winnerN: job.negentropicIndex,
        entropy: job.entropy,
        coherence: job.coherence,
        totalTime: Date.now() - startTime
      });
      
      return result;
    } catch (error) {
      throw new Error(`Job ${job.id} failed: ${error}`);
    }
  }
  
  /**
   * Get decision history
   */
  getDecisionLog(): SchedulerDecision[] {
    return [...this.decisionLog];
  }
  
  /**
   * Clear decision log
   */
  clearLog(): void {
    this.decisionLog = [];
  }
  
  /**
   * Get scheduler statistics
   */
  getStats(): {
    totalDecisions: number;
    averageN: number;
    averageEntropy: number;
    averageCoherence: number;
    averageTime: number;
  } {
    if (this.decisionLog.length === 0) {
      return {
        totalDecisions: 0,
        averageN: 0,
        averageEntropy: 0,
        averageCoherence: 0,
        averageTime: 0
      };
    }
    
    const sum = this.decisionLog.reduce(
      (acc, decision) => ({
        N: acc.N + decision.winnerN,
        entropy: acc.entropy + decision.entropy,
        coherence: acc.coherence + decision.coherence,
        time: acc.time + decision.totalTime
      }),
      { N: 0, entropy: 0, coherence: 0, time: 0 }
    );
    
    const count = this.decisionLog.length;
    
    return {
      totalDecisions: count,
      averageN: sum.N / count,
      averageEntropy: sum.entropy / count,
      averageCoherence: sum.coherence / count,
      averageTime: sum.time / count
    };
  }
  
  /**
   * Log a scheduling decision
   */
  private logDecision(decision: SchedulerDecision): void {
    this.decisionLog.push(decision);
    
    // Trim log if too large
    if (this.decisionLog.length > this.maxLogSize) {
      this.decisionLog.shift();
    }
  }
}
