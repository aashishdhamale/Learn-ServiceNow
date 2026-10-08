import type { Difficulty, Module } from './schema';

export const MODULE_LABELS: Record<Module, string> = {
  PLATFORM: 'Platform',
  ITSM: 'IT Service Management',
  ITOM: 'IT Operations Management',
  HRSD: 'HR Service Delivery',
  CSM: 'Customer Service Management',
  FSM: 'Field Service Management',
  SPM: 'Strategic Portfolio Management',
  SECOPS: 'Security Operations',
  IRM: 'Integrated Risk Management',
};

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  expert: 'Expert',
};
