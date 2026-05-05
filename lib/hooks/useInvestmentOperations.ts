import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import {
  getInternalTransfers,
  getInvestmentOperations,
  getRealizedInvestmentSummary,
} from '@/lib/services/investmentOperationService';

export function useInvestmentOperations(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.assets.operations(userId || ''),
    queryFn: () => getInvestmentOperations(userId!),
    enabled: !!userId,
  });
}

export function useRealizedInvestmentSummary(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.assets.realized(userId || ''),
    queryFn: () => getRealizedInvestmentSummary(userId!),
    enabled: !!userId,
  });
}

export function useInternalTransfers(userId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.assets.transfers(userId || ''),
    queryFn: () => getInternalTransfers(userId!),
    enabled: !!userId,
  });
}
