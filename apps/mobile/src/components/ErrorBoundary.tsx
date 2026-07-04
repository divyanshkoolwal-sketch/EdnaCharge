/** @file apps/mobile/src/components/ErrorBoundary.tsx. */
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Sentry } from '../lib/sentry';

/**
 * App-wide safety net. React error boundaries catch errors thrown during
 * render AND synchronously inside effects (effects run in the commit phase),
 * which is exactly the class of bug that used to take the whole app down — an
 * uncaught throw in a screen's `useEffect` (e.g. the map's realtime
 * subscription) crashed the process in release because there was no boundary
 * and there was no app-wide reporter.
 *
 * With this in place, any such error shows a recoverable fallback instead of
 * crashing, and is reported via `Sentry.captureException`.
 */
type Props = { children: React.ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    Sentry.captureException(error);
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.error('ErrorBoundary caught:', error, info?.componentStack);
    }
  }

  private reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 32,
            backgroundColor: '#FFFFFF',
          }}
        >
          <Text style={{ fontSize: 20, fontWeight: '800', color: '#0F0F10', marginBottom: 8 }}>
            Something went wrong
          </Text>
          <Text style={{ fontSize: 14, color: '#3D3D40', textAlign: 'center', marginBottom: 24 }}>
            This screen hit an unexpected error. You can try again.
          </Text>
          <Pressable
            onPress={this.reset}
            style={{
              backgroundColor: '#0F0F10',
              borderRadius: 999,
              paddingHorizontal: 28,
              height: 52,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 16 }}>Try again</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}
