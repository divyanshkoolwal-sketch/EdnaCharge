/** Live OCPP connection and credential card for host chargers. */
import { Alert, Text, View } from 'react-native';
import { Body, Button, Card, Muted, Row, SectionHeader } from '../../components/ui';
import { useTheme } from '../../theme/useTheme';
import { trpc } from '../../lib/trpc';
import { handleError } from '../../lib/errors';

export function ConnectChargerCard({ chargerId }: { chargerId: string }) {
  const { c } = useTheme();
  const status = trpc.charger.connectionStatus.useQuery(
    { id: chargerId },
    { refetchInterval: 5000 },
  );
  const details = trpc.charger.connectionDetails.useQuery(
    { id: chargerId },
    { enabled: false, retry: false },
  );
  const regen = trpc.charger.regenerateOcppCredentials.useMutation({
    onSuccess: () => details.refetch(),
    onError: (e) => handleError(e, { feature: 'OCPP credentials' }),
  });

  const connected = status.data?.connected ?? false;
  const creds = details.data;

  const confirmRegen = () =>
    Alert.alert(
      'Regenerate credentials?',
      "This creates a new password and invalidates the current one. If your charger is already configured, you'll need to update it with the new password.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Regenerate',
          style: 'destructive',
          onPress: () => regen.mutate({ id: chargerId }),
        },
      ],
    );

  return (
    <>
      <SectionHeader>Connect your charger</SectionHeader>
      <Card padding={14}>
        <Row between>
          <Row gap={8}>
            <View
              style={{
                width: 9,
                height: 9,
                borderRadius: 5,
                backgroundColor: connected ? c.green2 : '#D4A82A',
              }}
            />
            <Body style={{ fontWeight: '700', fontSize: 14 }}>
              {connected ? 'Connected' : 'Waiting for your charger…'}
            </Body>
          </Row>
          {connected && status.data?.lastConnectedAt ? (
            <Muted style={{ fontSize: 11 }}>
              since {new Date(status.data.lastConnectedAt).toLocaleTimeString()}
            </Muted>
          ) : null}
        </Row>
        <Muted style={{ fontSize: 12, marginTop: 8, lineHeight: 18 }}>
          In your charger's OCPP settings, choose OCPP 1.6 (JSON over WebSocket) and enter the
          server URL, charge point ID, and password below. It'll show as connected here within a few
          seconds.
        </Muted>

        {creds ? (
          <View style={{ marginTop: 12, gap: 10 }}>
            <CredRow label="Server URL (OCPP 1.6J)" value={creds.wssUrl} />
            <CredRow label="Charge point ID" value={creds.chargePointId} />
            <CredRow label="Password" value={creds.password} />
            <Button
              label={regen.isPending ? 'Regenerating…' : 'Regenerate credentials'}
              variant="secondary"
              onPress={confirmRegen}
              loading={regen.isPending}
              height={40}
              fontSize={12}
            />
          </View>
        ) : (
          <View style={{ marginTop: 12, gap: 8 }}>
            <Button
              label={details.isFetching ? 'Loading…' : 'Show connection details'}
              variant="secondary"
              onPress={() => details.refetch()}
              loading={details.isFetching}
              height={44}
              fontSize={13}
            />
            {details.error && !details.isFetching ? (
              <>
                <Muted style={{ fontSize: 12, color: c.red ?? '#E26B5C', lineHeight: 17 }}>
                  {details.error.message}
                </Muted>
                <Button
                  label={regen.isPending ? 'Regenerating…' : 'Regenerate credentials'}
                  variant="secondary"
                  onPress={confirmRegen}
                  loading={regen.isPending}
                  height={40}
                  fontSize={12}
                />
              </>
            ) : null}
          </View>
        )}
      </Card>
    </>
  );
}

function CredRow({ label, value }: { label: string; value: string }) {
  const { c } = useTheme();
  return (
    <View>
      <Muted style={{ fontSize: 11, marginBottom: 3 }}>{label}</Muted>
      <View
        style={{
          backgroundColor: c.chip,
          borderRadius: 8,
          paddingHorizontal: 10,
          paddingVertical: 9,
        }}
      >
        <Text selectable style={{ fontSize: 13, color: c.ink, fontFamily: 'Courier' }}>
          {value}
        </Text>
      </View>
    </View>
  );
}
