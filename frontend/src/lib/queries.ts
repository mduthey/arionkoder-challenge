import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
	type CreateAppointmentInput,
	cancelAppointment,
	createAppointment,
	getAppointments,
	getAvailability,
	getConfig,
	getDoctors,
} from '~/lib/api';

export const queryKeys = {
	config: ['config'] as const,
	doctors: ['doctors'] as const,
	availability: (doctorId?: number, date?: string, duration?: number) =>
		['availability', doctorId, date, duration] as const,
	appointments: ['appointments'] as const,
};

export function useConfig() {
	return useQuery({ queryKey: queryKeys.config, queryFn: getConfig, staleTime: Number.POSITIVE_INFINITY });
}

export function useDoctors() {
	return useQuery({ queryKey: queryKeys.doctors, queryFn: getDoctors, staleTime: Number.POSITIVE_INFINITY });
}

export function useAvailability(doctorId: number | undefined, date: string | undefined, duration: number) {
	return useQuery({
		queryKey: queryKeys.availability(doctorId, date, duration),
		// biome-ignore lint/style/noNonNullAssertion: guarded by `enabled`
		queryFn: () => getAvailability(doctorId!, date!, duration),
		enabled: Boolean(doctorId && date && duration),
	});
}

export function useAppointments() {
	return useQuery({ queryKey: queryKeys.appointments, queryFn: getAppointments });
}

function useInvalidateBookings() {
	const queryClient = useQueryClient();
	return () =>
		Promise.all([
			queryClient.invalidateQueries({ queryKey: queryKeys.appointments }),
			queryClient.invalidateQueries({ queryKey: ['availability'] }),
		]);
}

export function useCreateAppointment() {
	const onSuccess = useInvalidateBookings();
	return useMutation({ mutationFn: (input: CreateAppointmentInput) => createAppointment(input), onSuccess });
}

export function useCancelAppointment() {
	const onSuccess = useInvalidateBookings();
	return useMutation({ mutationFn: (id: number) => cancelAppointment(id), onSuccess });
}
