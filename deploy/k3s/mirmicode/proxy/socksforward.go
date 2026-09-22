// SOCKS5 CONNECT forwarder for the Tailscale userspace sidecar.
// Caddy speaks TLS to 127.0.0.1; this process asks tailscaled to resolve
// the MagicDNS name and carry the bytes.
package main

import (
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"strconv"
	"time"
)

func main() {
	listen := getenv("FORWARD_LISTEN", "127.0.0.1:8443")
	socks := getenv("SOCKS_ADDR", "127.0.0.1:1055")
	host := getenv("WORKING_SET_UPSTREAM_HOST", "cahq.tail21f530.ts.net")
	port, err := strconv.Atoi(getenv("WORKING_SET_UPSTREAM_PORT", "443"))
	if err != nil || port < 1 || port > 65535 || !validDNSName(host) {
		fmt.Fprintln(os.Stderr, "socksforward: upstream host or port is invalid")
		os.Exit(2)
	}

	ln, err := net.Listen("tcp", listen)
	if err != nil {
		fmt.Fprintf(os.Stderr, "socksforward: listen: %v\n", err)
		os.Exit(1)
	}
	defer ln.Close()

	for {
		client, err := ln.Accept()
		if err != nil {
			fmt.Fprintf(os.Stderr, "socksforward: accept: %v\n", err)
			continue
		}
		go serve(client, socks, host, port)
	}
}

func serve(client net.Conn, socksAddr, host string, port int) {
	defer client.Close()
	upstream, err := dialSOCKS5(socksAddr, host, port, 10*time.Second)
	if err != nil {
		fmt.Fprintf(os.Stderr, "socksforward: dial: %v\n", err)
		return
	}
	defer upstream.Close()
	done := make(chan struct{})
	go func() {
		_, _ = io.Copy(upstream, client)
		_ = upstream.Close()
		close(done)
	}()
	_, _ = io.Copy(client, upstream)
	_ = client.Close()
	<-done
}

func dialSOCKS5(socksAddr, host string, port int, timeout time.Duration) (net.Conn, error) {
	if !validDNSName(host) || port < 1 || port > 65535 {
		return nil, errors.New("invalid socks target")
	}
	conn, err := net.DialTimeout("tcp", socksAddr, timeout)
	if err != nil {
		return nil, err
	}
	_ = conn.SetDeadline(time.Now().Add(timeout))
	if _, err := conn.Write([]byte{0x05, 0x01, 0x00}); err != nil {
		conn.Close()
		return nil, err
	}
	var greeting [2]byte
	if _, err := io.ReadFull(conn, greeting[:]); err != nil {
		conn.Close()
		return nil, err
	}
	if greeting[0] != 0x05 || greeting[1] != 0x00 {
		conn.Close()
		return nil, errors.New("socks5 server refused no-auth")
	}

	req := make([]byte, 0, 7+len(host))
	req = append(req, 0x05, 0x01, 0x00, 0x03, byte(len(host)))
	req = append(req, host...)
	var portBytes [2]byte
	binary.BigEndian.PutUint16(portBytes[:], uint16(port))
	req = append(req, portBytes[:]...)
	if _, err := conn.Write(req); err != nil {
		conn.Close()
		return nil, err
	}

	var hdr [4]byte
	if _, err := io.ReadFull(conn, hdr[:]); err != nil {
		conn.Close()
		return nil, err
	}
	if hdr[0] != 0x05 || hdr[1] != 0x00 {
		conn.Close()
		return nil, fmt.Errorf("socks5 connect status %d", hdr[1])
	}
	if err := discardBindAddr(conn, hdr[3]); err != nil {
		conn.Close()
		return nil, err
	}
	_ = conn.SetDeadline(time.Time{})
	return conn, nil
}

func discardBindAddr(r io.Reader, atyp byte) error {
	switch atyp {
	case 0x01:
		_, err := io.CopyN(io.Discard, r, 4+2)
		return err
	case 0x04:
		_, err := io.CopyN(io.Discard, r, 16+2)
		return err
	case 0x03:
		var n [1]byte
		if _, err := io.ReadFull(r, n[:]); err != nil {
			return err
		}
		_, err := io.CopyN(io.Discard, r, int64(n[0])+2)
		return err
	default:
		return errors.New("socks5 bind address type")
	}
}

func validDNSName(host string) bool {
	if host == "" || len(host) > 253 {
		return false
	}
	for i := 0; i < len(host); i++ {
		c := host[i]
		switch {
		case c >= 'a' && c <= 'z':
		case c >= 'A' && c <= 'Z':
		case c >= '0' && c <= '9':
		case c == '.' || c == '-':
		default:
			return false
		}
	}
	return true
}

func getenv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
