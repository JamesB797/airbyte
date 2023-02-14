import React, { useCallback, useContext, useMemo } from "react";
import { useMutation, useQueryClient } from "react-query";
import { useNavigate, useMatch } from "react-router-dom";

import { Workspace } from "core/domain/workspace";
import {
  getWorkspace,
  listWorkspaces,
  updateWorkspace,
  webBackendGetWorkspaceState,
  WorkspaceUpdate,
} from "core/request/AirbyteClient";
import { useRequestOptions } from "core/request/useRequestOptions";
import { RoutePaths } from "pages/routePaths";

import { useSuspenseQuery } from "../connector/useSuspenseQuery";
import { SCOPE_USER, SCOPE_WORKSPACE } from "../Scope";

export const workspaceKeys = {
  all: [SCOPE_USER, "workspaces"] as const,
  lists: () => [...workspaceKeys.all, "list"] as const,
  list: (filters: string) => [...workspaceKeys.lists(), { filters }] as const,
  detail: (workspaceId: string) => [...workspaceKeys.all, "details", workspaceId] as const,
  state: (workspaceId: string) => [...workspaceKeys.all, "state", workspaceId] as const,
};

interface Context {
  selectWorkspace: (workspaceId?: string | null | Workspace) => void;
  exitWorkspace: () => void;
}

export const WorkspaceServiceContext = React.createContext<Context | null>(null);

const useSelectWorkspace = (): ((workspace?: string | null | Workspace) => void) => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useCallback(
    async (workspace) => {
      if (typeof workspace === "object") {
        navigate(`/${RoutePaths.Workspaces}/${workspace?.workspaceId}`);
      } else {
        navigate(`/${RoutePaths.Workspaces}/${workspace}`);
      }
      queryClient.removeQueries(SCOPE_WORKSPACE);
    },
    [navigate, queryClient]
  );
};

export const WorkspaceServiceProvider: React.FC<React.PropsWithChildren<unknown>> = ({ children }) => {
  const selectWorkspace = useSelectWorkspace();

  const ctx = useMemo<Context>(
    () => ({
      selectWorkspace,
      exitWorkspace: () => {
        selectWorkspace("");
      },
    }),
    [selectWorkspace]
  );

  return <WorkspaceServiceContext.Provider value={ctx}>{children}</WorkspaceServiceContext.Provider>;
};

export const useWorkspaceService = (): Context => {
  const workspaceService = useContext(WorkspaceServiceContext);
  if (!workspaceService) {
    throw new Error("useWorkspaceService must be used within a WorkspaceServiceProvider.");
  }

  return workspaceService;
};

export const useCurrentWorkspaceId = () => {
  const match = useMatch(`/${RoutePaths.Workspaces}/:workspaceId/*`);
  return match?.params.workspaceId || "";
};

export const useCurrentWorkspace = () => {
  const workspaceId = useCurrentWorkspaceId();

  return useGetWorkspace(workspaceId, {
    staleTime: Infinity,
  });
};

export const useCurrentWorkspaceState = () => {
  const workspaceId = useCurrentWorkspaceId();
  const requestOptions = useRequestOptions();

  return useSuspenseQuery(
    workspaceKeys.state(workspaceId),
    () => webBackendGetWorkspaceState({ workspaceId }, requestOptions),
    {
      // We want to keep this query only shortly in cache, so we refetch
      // the data whenever the user might have changed sources/destinations/connections
      // without requiring to manually invalidate that query on each change.
      cacheTime: 5 * 1000,
    }
  );
};

export const useListWorkspaces = () => {
  const requestOptions = useRequestOptions();
  return useSuspenseQuery(workspaceKeys.lists(), () => listWorkspaces(requestOptions)).workspaces;
};

export const useGetWorkspace = (
  workspaceId: string,
  options?: {
    staleTime: number;
  }
) => {
  const requestOptions = useRequestOptions();
  return useSuspenseQuery(
    workspaceKeys.detail(workspaceId),
    () => getWorkspace({ workspaceId }, requestOptions),
    options
  );
};

export const useUpdateWorkspace = () => {
  const requestOptions = useRequestOptions();
  const queryClient = useQueryClient();

  return useMutation((workspace: WorkspaceUpdate) => updateWorkspace(workspace, requestOptions), {
    onSuccess: (data) => {
      queryClient.setQueryData(workspaceKeys.detail(data.workspaceId), data);
    },
  });
};

export const useInvalidateWorkspace = (workspaceId: string) => {
  const queryClient = useQueryClient();

  return useCallback(
    () => queryClient.invalidateQueries(workspaceKeys.detail(workspaceId)),
    [queryClient, workspaceId]
  );
};
