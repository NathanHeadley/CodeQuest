<?php
/**
 * CodeQuest launcher / SSO bridge  (REFERENCE COPY).
 *
 * Deployed on the MAIN site at: /var/www/main-site/public_html/tools/codequest/index.php
 * (URL: https://joltcomputing.com/tools/codequest/). Kept here in the game repo for
 * documentation; edit the deployed copy or redeploy from here.
 *
 * The pupil is already authenticated via the existing Microsoft SAML SSO (see
 * /saml/acs.php, which stores userID / userDisplayName / yearGroup in the session).
 * This page mints a short-lived RS256 JWT from that session and forwards the pupil to
 * the game server, already logged in.
 *
 * Keys:
 *   - PRIVATE (sign): /etc/jolt/codequest_jwt_private.pem  -- MAIN site only, 0600 www-data
 *   - PUBLIC (verify): /var/www/codequest/backend/keys/jwt_public.pem -- game VPS only
 *   generate with:
 *     openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out private.pem
 *     openssl rsa -in private.pem -pubout -out public.pem
 *
 * No Composer dependency -- signs with openssl directly.
 */
session_start();

$next = (isset($_GET['next']) && $_GET['next'] === 'dashboard') ? 'dashboard' : '';

if (empty($_SESSION['userID'])) {
    $self = 'https://joltcomputing.com/tools/codequest/' . ($next ? '?next=dashboard' : '');
    header('Location: /saml/login.php?redirect=' . urlencode($self));
    exit;
}

$privateKey = file_get_contents('/etc/jolt/codequest_jwt_private.pem');
if ($privateKey === false) {
    http_response_code(500);
    exit('CodeQuest is temporarily unavailable.');
}

function cq_b64url($data) {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

$now = time();
$header  = ['alg' => 'RS256', 'typ' => 'JWT'];
$payload = [
    'iss'        => 'joltcomputing.com',
    'aud'        => 'codequest',
    'sub'        => $_SESSION['userID'],
    'name'       => $_SESSION['userDisplayName'] ?? 'Pupil',
    'year_group' => $_SESSION['yearGroup'] ?? null,
    'iat'        => $now,
    'exp'        => $now + 8 * 3600,
];

$signingInput = cq_b64url(json_encode($header)) . '.' . cq_b64url(json_encode($payload));
$signature = '';
if (!openssl_sign($signingInput, $signature, $privateKey, OPENSSL_ALGO_SHA256)) {
    http_response_code(500);
    exit('CodeQuest sign-in failed.');
}
$jwt = $signingInput . '.' . cq_b64url($signature);

$dest = $next === 'dashboard'
    ? 'https://game.joltcomputing.com/dashboard/'
    : 'https://game.joltcomputing.com/';
header('Location: ' . $dest . '?token=' . urlencode($jwt));
exit;
