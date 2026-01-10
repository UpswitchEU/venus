import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ClientContextResponseDto {
  accountantUser: {
    id: string;
    email: string;
    full_name: string;
  };
  clientUser: {
    id: string;
    email: string;
    full_name: string;
    avatar_url: string | null;
  };
  relationship: {
    id: string;
    customer_name: string;
  };
}

interface ClientContextState {
  isActingAsClient: boolean;
  accountant: {
    id: string;
    email: string;
    fullName: string;
  } | null;
  client: {
    id: string;
    email: string;
    fullName: string;
    avatarUrl: string | null;
  } | null;
  relationshipId: string | null;

  setClientContext: (context: ClientContextResponseDto) => void;
  clearClientContext: () => void;
  getContextHeaders: () => Record<string, string>;
}

export const useClientContext = create<ClientContextState>()(
  persist(
    (set, get) => ({
      isActingAsClient: false,
      accountant: null,
      client: null,
      relationshipId: null,

      setClientContext: (context) => {
        set({
          isActingAsClient: true,
          accountant: {
            id: context.accountantUser.id,
            email: context.accountantUser.email,
            fullName: context.accountantUser.full_name,
          },
          client: {
            id: context.clientUser.id,
            email: context.clientUser.email,
            fullName: context.clientUser.full_name,
            avatarUrl: context.clientUser.avatar_url,
          },
          relationshipId: context.relationship.id,
        });
      },

      clearClientContext: () => {
        set({
          isActingAsClient: false,
          accountant: null,
          client: null,
          relationshipId: null,
        });
      },

      getContextHeaders: () => {
        const state = get();
        if (!state.isActingAsClient) return {};

        return {
          'X-Client-Context-User': state.client!.id,
          'X-Client-Context-Accountant': state.accountant!.id,
          'X-Client-Context-Relationship': state.relationshipId!,
        };
      },
    }),
    { name: 'client-context' }
  )
);
