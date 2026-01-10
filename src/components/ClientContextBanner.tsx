import React from 'react';
import { useClientContext } from '../stores/clientContext';
import { X } from 'lucide-react';

/**
 * Client Context Banner
 * 
 * Displays when an accountant is acting on behalf of a client.
 * Shows client's name and avatar, with option to exit client view.
 */
export function ClientContextBanner() {
  const { isActingAsClient, client, clearClientContext } = useClientContext();

  if (!isActingAsClient || !client) return null;

  return (
    <div className="bg-blue-50 border-b border-blue-200 px-4 py-2">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Client Avatar */}
          <div className="flex-shrink-0">
            {client.avatarUrl ? (
              <img
                src={client.avatarUrl}
                alt={client.fullName}
                className="w-8 h-8 rounded-full object-cover border-2 border-blue-300"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-blue-300 flex items-center justify-center border-2 border-blue-400">
                <span className="text-blue-800 font-semibold text-sm">
                  {client.fullName.charAt(0).toUpperCase()}
                </span>
              </div>
            )}
          </div>

          {/* Context Info */}
          <div>
            <p className="text-sm font-medium text-blue-900">
              Acting as {client.fullName}
            </p>
            <p className="text-xs text-blue-700">
              Reports created will belong to this client
            </p>
          </div>
        </div>

        {/* Exit Button */}
        <button
          onClick={clearClientContext}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-blue-700 hover:text-blue-900 hover:bg-blue-100 rounded-md transition-colors duration-200"
        >
          <X className="w-4 h-4" />
          <span>Exit Client View</span>
        </button>
      </div>
    </div>
  );
}
